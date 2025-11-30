// server/ai-providers.js
const OpenAI = require('openai');
const { GoogleGenAI } = require('@google/genai');

const OPENAI_API_BASE = "https://api.openai.com/v1";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// --- ENV HELPERS ---
function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY || process.env.API_KEY || 'dummy-key';
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.API_KEY || 'dummy-key';
}

// --- OPENAI HANDLER ---

function buildOpenAiMessages(agent, messages, visionImages) {
  const chatMessages = [];

  if (agent.systemPrompt && agent.systemPrompt.trim().length > 0) {
    chatMessages.push({
      role: "system",
      content: agent.systemPrompt,
    });
  }

  messages.forEach((m, idx) => {
    const isLast = idx === messages.length - 1;
    const isUser = m.role === "user";

    // "tool" role messages from previous turns just pass through content
    if (m.role === 'tool') {
       chatMessages.push({
         role: 'tool',
         tool_call_id: m.toolCallId, // Ensure your message structure has this
         content: m.content
       });
       return;
    }

    if (isUser && visionImages && visionImages.length > 0 && isLast) {
      chatMessages.push({
        role: "user",
        content: [
          { type: "text", text: m.content },
          ...visionImages.map((img) => ({
            type: "image_url",
            image_url: {
              url: `data:${img.mimeType};base64,${img.data || img.dataBase64}`,
            },
          })),
        ],
      });
    } else {
      chatMessages.push({
        role: m.role,
        content: m.content,
      });
    }
  });

  return chatMessages;
}

function mapToolsToOpenAi(tools) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

async function callOpenAiWithTools(agent, messages, tools = [], visionImages, ctx) {
  const openai = new OpenAI({ apiKey: getOpenAiApiKey() });
  const model = agent.model || "gpt-4o";

  const toolSpecs = mapToolsToOpenAi(tools);
  const toolResults = [];

  // We maintain a messages array in OpenAI format and mutate it with tool calls.
  let chatMessages = buildOpenAiMessages(agent, messages, visionImages);
  let raw = null;

  let iterations = 0;
  const maxIterations = 5;

  while (iterations < maxIterations) {
    iterations += 1;

    const completion = await openai.chat.completions.create({
      model,
      messages: chatMessages,
      temperature: agent.temperature ?? 0.4,
      max_tokens: agent.maxTokens ?? 1024,
      tools: toolSpecs,
      tool_choice: toolSpecs ? "auto" : undefined,
    });

    raw = completion;
    const choice = completion.choices?.[0];
    const msg = choice?.message;

    if (!msg) throw new Error("OpenAI returned no message.");

    const toolCalls = msg.tool_calls || [];

    // If the model wants to call tools, run them and loop again.
    if (toolCalls.length > 0 && tools.length > 0) {
      chatMessages.push(msg); // keep the assistant message with tool_calls in history

      for (const call of toolCalls) {
        const toolName = call.function?.name;
        const argsJson = call.function?.arguments ?? "{}";
        const toolDef = tools.find((t) => t.name === toolName);

        if (!toolDef) {
          ctx.log?.("OpenAI requested unknown tool", { toolName, argsJson });
          chatMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: "Error: Tool not found",
          });
          continue;
        }

        let args = {};
        try {
          args = JSON.parse(argsJson);
        } catch (err) {
          ctx.log?.("Failed to parse tool arguments", { toolName, argsJson, err });
          chatMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: "Error: Invalid JSON arguments",
          });
          continue;
        }

        let result;
        try {
          result = await toolDef.handler(args, ctx);
        } catch(e) {
          result = `Error executing tool: ${e.message}`;
        }
        
        toolResults.push({ toolName, args, result });

        chatMessages.push({
          role: "tool",
          tool_call_id: call.id,
          name: toolName,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }
      continue;
    }

    // No tool calls => final answer.
    const text = msg.content || "";
    
    // Construct final message object for app usage
    const finalMessages = [
      ...messages,
      {
        role: "assistant",
        content: text,
      },
    ];

    return {
      provider: "openai",
      model,
      messages: finalMessages,
      finalText: text,
      toolResults,
      rawResponse: raw,
    };
  }

  throw new Error("OpenAI tool loop exceeded maximum iterations.");
}

// --- GEMINI HANDLER ---

function buildGeminiContents(agent, messages, visionImages) {
  const contents = [];

  const systemInstruction =
    agent.systemPrompt && agent.systemPrompt.trim().length > 0
      ? agent.systemPrompt
      : undefined;

  messages.forEach((m, idx) => {
    const isLast = idx === messages.length - 1;
    const isUser = m.role === "user";
    
    // Gemini roles: 'user' or 'model'. 'tool' roles are handled via functionResponse parts attached to 'user' or implicit history.
    // For simplicity in this loop, we map 'user'->'user', 'assistant'->'model'.
    // Tool outputs must be inserted carefully.
    // This implementation assumes the incoming `messages` are text chat history.
    // Handling explicit tool history re-injection for Gemini is complex; 
    // we often rely on the session state if using `chat.sendMessage` or 
    // simply reconstruct text history if using stateless `generateContent`.
    
    // Stateless approach:
    const role = m.role === "assistant" ? "model" : "user";
    if (m.role === 'tool') {
        // Skip purely historical tool outputs for the basic content build, 
        // as they need to be paired with functionCalls in a specific structure.
        // For a robust stateless implementation, we'd need to reconstruct the [FunctionCall, FunctionResponse] pairs.
        // Simplified fallback: append tool output as user text context.
        contents.push({
            role: 'user',
            parts: [{ text: `[System Tool Output]: ${m.content}` }]
        });
        return;
    }

    if (isUser && visionImages && visionImages.length > 0 && isLast) {
      contents.push({
        role,
        parts: [
          { text: m.content },
          ...visionImages.map((img) => ({
            inlineData: {
              mimeType: img.mimeType,
              data: img.data || img.dataBase64,
            },
          })),
        ],
      });
    } else {
      contents.push({
        role,
        parts: [{ text: m.content }],
      });
    }
  });

  return { systemInstruction, contents };
}

function mapToolsToGemini(tools) {
  if (!tools || tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

async function callGeminiWithTools(agent, messages, tools = [], visionImages, ctx) {
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const modelId = agent.model || "gemini-2.5-flash";
  const model = ai.getGenerativeModel({ model: modelId });

  const toolSpecs = mapToolsToGemini(tools);
  const toolResults = [];

  const { systemInstruction, contents } = buildGeminiContents(agent, messages, visionImages);

  // Mutable history for turn-taking
  let currentHistory = [...contents]; 

  // If using chat session
  const chat = model.startChat({
    history: currentHistory.slice(0, -1), // all but last
    systemInstruction: systemInstruction,
    tools: toolSpecs
  });
  
  // Send the very last message to kick off
  let lastContent = currentHistory[currentHistory.length - 1];
  
  let iterations = 0;
  const maxIterations = 5;

  // Initial send
  let result = await chat.sendMessage(lastContent.parts);

  while (iterations < maxIterations) {
    iterations++;
    const response = result.response;
    const calls = response.functionCalls();

    if (calls && calls.length > 0) {
        // Execute tools
        const functionResponses = [];
        for (const call of calls) {
            const toolDef = tools.find(t => t.name === call.name);
            let output;
            if (!toolDef) {
                output = "Error: Tool not found";
            } else {
                try {
                    output = await toolDef.handler(call.args, ctx);
                } catch (e) {
                    output = `Error: ${e.message}`;
                }
            }
            toolResults.push({ toolName: call.name, args: call.args, result: output });
            functionResponses.push({
                name: call.name,
                response: { result: output }
            });
        }
        // Send tool results back to model
        result = await chat.sendMessage(functionResponses);
    } else {
        // No more tools, we have the answer
        const text = response.text();
        return {
            provider: "gemini",
            model: modelId,
            messages: [...messages, { role: "assistant", content: text }],
            finalText: text,
            toolResults,
            rawResponse: response
        };
    }
  }

  throw new Error("Gemini tool loop exceeded maximum iterations.");
}

// --- MAIN RUNNER ---

async function runAgentWithTools(request, ctx) {
  const { agent, messages, tools = [], visionImages } = request;

  if (agent.provider === "openai") {
    return callOpenAiWithTools(agent, messages, tools, visionImages, ctx);
  }

  if (agent.provider === "gemini") {
    return callGeminiWithTools(agent, messages, tools, visionImages, ctx);
  }

  throw new Error(`Unsupported provider: ${agent.provider}`);
}

// --- DOMAIN TOOLS DEFINITIONS ---

const brokerAndJournalTools = [
  {
    name: "get_broker_overview",
    description: "Get high-level overview of the active broker account (balance, equity, margin, PnL).",
    parameters: {
      type: "object",
      properties: {
        accountId: { type: "string" },
      },
    },
    handler: async (args, ctx) => {
      if (!ctx.getBrokerState) throw new Error("Missing getBrokerState ctx");
      return ctx.getBrokerState(args.accountId);
    },
  },
  {
    name: "get_open_positions",
    description: "List current open positions for an account (optionally filtered by symbol).",
    parameters: {
      type: "object",
      properties: {
        accountId: { type: "string" },
        symbol: { type: "string" }
      },
      required: [],
      additionalProperties: false
    },
    handler: async (args, ctx) => {
      if (!ctx.getOpenPositions) throw new Error("Missing getOpenPositions ctx");
      return ctx.getOpenPositions(args.accountId, args.symbol);
    }
  },
  {
    name: "get_recent_trades",
    description: "Return the last N closed trades from the trading journal/history.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", default: 20 },
      },
    },
    handler: async (args, ctx) => {
      if (!ctx.getRecentTrades) throw new Error("Missing getRecentTrades ctx");
      return ctx.getRecentTrades({ limit: args.limit });
    },
  },
  {
    name: "append_journal_entry",
    description: "Append a note or reflection to the trading journal.",
    parameters: {
      type: "object",
      properties: {
        note: { type: "string" },
        sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
        tag: { type: "string" },
      },
      required: ["note"],
    },
    handler: async (args, ctx) => {
      if (!ctx.appendJournalEntry) throw new Error("Missing appendJournalEntry ctx");
      const payload = {
        note: args.note,
        sentiment: args.sentiment ?? "neutral",
        tag: args.tag ?? "ai",
        createdAt: new Date().toISOString(),
      };
      await ctx.appendJournalEntry(payload);
      return { status: "ok" };
    },
  },
  {
    name: "get_playbooks",
    description: "Fetch saved playbooks / setups for the current symbol.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string" },
      },
    },
    handler: async (args, ctx) => {
      if (!ctx.getPlaybooks) throw new Error("Missing getPlaybooks ctx");
      return ctx.getPlaybooks({ symbol: args.symbol });
    },
  },
  {
    name: "fetch_url_html",
    description: "Fetch raw text content from a URL (simulated for now).",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" }
      },
      required: ["url"]
    },
    handler: async (args, ctx) => {
      // Simulate fetch
      return `[System] Fetched content from ${args.url}: (Mock Data: The market is waiting for FOMC minutes...)`;
    }
  },
  {
    name: "save_playbook_variant",
    description: "Save a playbook variant logic.",
    parameters: {
      type: "object",
      properties: {
        basePlaybookName: { type: 'string' },
        variantName: { type: 'string' },
        entryRules: { type: 'string' },
        exitRules: { type: 'string' },
      },
      required: ["basePlaybookName"]
    },
    handler: async (args, ctx) => {
       if (ctx.savePlaybookVariant) {
         return ctx.savePlaybookVariant(args);
       }
       return "Playbook variant saved (simulated).";
    }
  }
];

module.exports = {
  runAgentWithTools,
  callOpenAiWithTools,
  callGeminiWithTools,
  brokerAndJournalTools
};
