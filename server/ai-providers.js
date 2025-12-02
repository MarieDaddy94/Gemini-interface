
// server/ai-providers.js
const OpenAI = require('openai');
const { GoogleGenAI } = require('@google/genai');

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
         tool_call_id: m.toolCallId,
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

  // Check for JSON mode preference
  const responseFormat = agent.response_format || (agent.forceJson ? { type: "json_object" } : undefined);

  while (iterations < maxIterations) {
    iterations += 1;

    const completion = await openai.chat.completions.create({
      model,
      messages: chatMessages,
      temperature: agent.temperature ?? 0.4,
      max_tokens: agent.maxTokens ?? 1024,
      tools: toolSpecs,
      tool_choice: toolSpecs ? "auto" : undefined,
      response_format: responseFormat
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

  messages.forEach((m, idx) => {
    const isLast = idx === messages.length - 1;
    const isUser = m.role === "user";
    
    // Convert generic 'assistant' role to Gemini 'model' role
    const role = m.role === "assistant" ? "model" : "user";
    
    if (m.role === 'tool') {
        // Gemini handles tool outputs differently in history.
        // We simulate by adding context as user.
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

  return contents;
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

  const toolSpecs = mapToolsToGemini(tools);
  const toolResults = [];

  const contents = buildGeminiContents(agent, messages, visionImages);

  let currentHistory = [...contents]; 
  
  const systemInstruction = agent.systemPrompt && agent.systemPrompt.trim().length > 0
      ? agent.systemPrompt
      : undefined;

  // Determine if we should force JSON output
  const responseMimeType = agent.responseMimeType || (agent.forceJson ? "application/json" : undefined);

  let iterations = 0;
  const maxIterations = 5;

  while (iterations < maxIterations) {
    iterations++;

    // Call model
    const response = await ai.models.generateContent({
        model: modelId,
        contents: currentHistory,
        config: {
            systemInstruction,
            tools: toolSpecs,
            temperature: agent.temperature ?? 0.4,
            responseMimeType: responseMimeType,
            // Pass thinking config if present
            thinkingConfig: agent.thinkingConfig
        }
    });

    const calls = response.functionCalls;

    if (calls && calls.length > 0) {
        // 1. Add model's function call message to history
        const modelContent = response.candidates?.[0]?.content;
        if (modelContent) {
             currentHistory.push(modelContent);
        }

        // 2. Execute tools and collect responses
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
            // Store for return value
            toolResults.push({ toolName: call.name, args: call.args, result: output });
            
            functionResponses.push({
                name: call.name,
                response: { result: output }
            });
        }

        // 3. Add function responses to history
        currentHistory.push({
            role: 'tool', 
            parts: functionResponses.map(fr => ({
                functionResponse: fr
            }))
        });

    } else {
        // No more tools, we have the answer
        const text = response.text || "";
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

  // Default fallback
  if (agent.model && agent.model.includes('gemini')) {
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
    },
  },
  {
    name: "execute_order",
    description: "Execute a market order on the broker. Use cautiously.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        side: { type: "string", enum: ["buy", "sell"] },
        size: { type: "number" },
        stopLoss: { type: "number" },
        takeProfit: { type: "number" },
        reason: { type: "string", description: "Why is this trade being taken? Justification is required." }
      },
      required: ["symbol", "side", "size", "reason"]
    },
    handler: async (args, ctx) => {
      if (!ctx.executeOrder) throw new Error("Missing executeOrder ctx");
      return ctx.executeOrder(args);
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
    description: "Append a structured trade log or note to the trading journal. Use this to log setups, executions, or reviews.",
    parameters: {
      type: "object",
      properties: {
        timestamp: { type: "string", description: "ISO datetime" },
        symbol: { type: "string", description: "Symbol traded (e.g. US30)" },
        direction: { type: "string", enum: ["long", "short"] },
        timeframe: { type: "string", description: "e.g. 5m, 15m, 1h" },
        session: { type: "string", description: "e.g. London, NY, Asia" },
        size: { type: "number", description: "Lot size" },
        netPnl: { type: "number" },
        rMultiple: { type: "number", description: "Realized R" },
        playbook: { type: "string", description: "Name of strategy/setup" },
        preTradePlan: { type: "string", description: "Plan before entry" },
        postTradeNotes: { type: "string", description: "Review after exit" },
        sentiment: { type: "string", description: "Psychological state" },
        tags: { type: "array", items: { type: "string" } },
        note: { type: "string" },
      },
    },
    handler: async (args, ctx) => {
      if (!ctx.appendJournalEntry) throw new Error("Missing appendJournalEntry ctx");
      const payload = { ...args, createdAt: new Date().toISOString() };
      await ctx.appendJournalEntry(payload);
      return { status: "ok", message: "Journal entry saved." };
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
  },
  {
    name: "control_app_ui",
    description: "Control the application UI: switch tabs (rooms), open overlays, or show toasts.",
    parameters: {
      type: "object",
      properties: {
        action: { 
          type: "string", 
          enum: ["navigate", "overlay", "toast"],
          description: "What UI action to perform."
        },
        target: { 
          type: "string", 
          description: "Target room ID (e.g. 'journal', 'autopilot') or overlay ID ('broker', 'settings')."
        },
        message: { 
          type: "string",
          description: "Message content for toasts or notifications."
        },
        type: {
          type: "string",
          enum: ["success", "info", "error"],
          description: "Toast type."
        }
      },
      required: ["action"]
    },
    handler: async (args, ctx) => {
        // Backend just echoes this back. The frontend 'AgentActionDispatcher' will intercept it via the tool bus.
        return { 
            status: "dispatched", 
            command: "control_app_ui", 
            details: args 
        };
    }
  }
];

module.exports = {
  runAgentWithTools,
  callOpenAiWithTools,
  callGeminiWithTools,
  brokerAndJournalTools
};
