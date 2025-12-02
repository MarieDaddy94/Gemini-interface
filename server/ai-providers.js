
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

  let chatMessages = buildOpenAiMessages(agent, messages, visionImages);
  let raw = null;

  let iterations = 0;
  const maxIterations = 5;

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

    if (toolCalls.length > 0 && tools.length > 0) {
      chatMessages.push(msg);

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

    const text = msg.content || "";
    
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
    const role = m.role === "assistant" ? "model" : "user";
    
    if (m.role === 'tool') {
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

  const responseMimeType = agent.responseMimeType || (agent.forceJson ? "application/json" : undefined);

  let iterations = 0;
  const maxIterations = 5;

  while (iterations < maxIterations) {
    iterations++;

    const response = await ai.models.generateContent({
        model: modelId,
        contents: currentHistory,
        config: {
            systemInstruction,
            tools: toolSpecs,
            temperature: agent.temperature ?? 0.4,
            responseMimeType: responseMimeType,
            thinkingConfig: agent.thinkingConfig
        }
    });

    const calls = response.functionCalls;

    if (calls && calls.length > 0) {
        const modelContent = response.candidates?.[0]?.content;
        if (modelContent) {
             currentHistory.push(modelContent);
        }

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

        currentHistory.push({
            role: 'tool', 
            parts: functionResponses.map(fr => ({
                functionResponse: fr
            }))
        });

    } else {
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

async function runAgentWithTools(request, ctx) {
  const { agent, messages, tools = [], visionImages } = request;

  if (agent.provider === "openai") {
    return callOpenAiWithTools(agent, messages, tools, visionImages, ctx);
  }

  if (agent.provider === "gemini") {
    return callGeminiWithTools(agent, messages, tools, visionImages, ctx);
  }

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
    description: "Log a planned or completed trade to the journal.",
    parameters: {
      type: "object",
      properties: {
        phase: { type: "string", enum: ["planned", "executed", "closed"] },
        symbol: { type: "string" },
        direction: { type: "string" },
        timeframe: { type: "string" },
        entryPrice: { type: "number" },
        stopPrice: { type: "number" },
        resultR: { type: "number" },
        resultPnl: { type: "number" },
        notes: { type: "string" },
        playbook: { type: "string" },
        deskGoal: { type: "string" },
      },
    },
    handler: async (args, ctx) => {
      if (ctx.journalService) {
        if (args.phase === 'planned') {
           return ctx.journalService.logEntry(args);
        } else {
           // For simplicity in agent flow, 'append_journal_entry' wraps various logic
           // In a real flow, you'd use updateEntry for existing IDs
           return ctx.journalService.logEntry(args);
        }
      }
      if (ctx.appendJournalEntry) {
         // Legacy fallback
         await ctx.appendJournalEntry(args);
         return { status: "ok", message: "Journal entry saved." };
      }
      return { error: "Journal service unavailable" };
    },
  },
  {
    name: "get_journal_stats",
    description: "Get aggregated performance stats from the journal (win rate, avg R, drawdown).",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        playbook: { type: "string" },
        days: { type: "number" }
      }
    },
    handler: async (args, ctx) => {
      if (!ctx.journalService) return { error: "Journal service unavailable" };
      return ctx.journalService.getStats(args);
    }
  },
  {
    name: "get_playbooks",
    description: "Fetch saved playbooks / setups definition templates.",
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
    name: "get_playbook_performance",
    description: "Get real-world performance stats (Green/Amber/Red health) for a specific playbook based on journal data.",
    parameters: {
      type: "object",
      properties: {
        playbookName: { type: "string", description: "Exact name of the playbook/setup to check." },
        symbol: { type: "string" },
        lookbackDays: { type: "number", description: "How far back to check (default 60)." }
      },
      required: ["playbookName"]
    },
    handler: async (args, ctx) => {
      if (!ctx.getPlaybookPerformance) throw new Error("Missing getPlaybookPerformance ctx");
      return ctx.getPlaybookPerformance(args);
    }
  },
  {
    name: "list_best_playbooks",
    description: "List the top-performing playbooks for a symbol based on recent journal stats.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        limit: { type: "number", default: 5 },
        lookbackDays: { type: "number", default: 60 }
      }
    },
    handler: async (args, ctx) => {
      if (!ctx.listBestPlaybooks) throw new Error("Missing listBestPlaybooks ctx");
      return ctx.listBestPlaybooks(args);
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
        return { 
            status: "dispatched", 
            command: "control_app_ui", 
            details: args 
        };
    }
  },
  {
    name: "desk_roundup",
    description: "Ask the Trading Desk Coordinator for a short status report and updated agent tasking.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "Optional specific question for the desk.",
        },
      },
      required: [],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
        if (!ctx.deskRoundup) throw new Error("Missing deskRoundup context handler");
        return ctx.deskRoundup(args);
    }
  },
  {
    name: "configure_trading_desk",
    description:
      "Configure the Trading Room Floor: set today's goal, session phase, and which agents watch which symbols/timeframes.",
    parameters: {
      type: "object",
      properties: {
        goal: { type: "string" },
        sessionPhase: { type: "string" },
        assignments: { type: "object" }
      },
      required: [],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
        return {
            status: "dispatched",
            command: "configure_trading_desk",
            details: args
        };
    }
  },
  {
    name: "run_autopilot_review",
    description:
      "Generate an Autopilot trade plan for the current desk context and run it through the risk engine.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        timeframe: { type: "string" },
        maxRiskPct: { type: "number" },
        sidePreference: { type: "string" },
        notes: { type: "string" }
      },
      required: ["symbol", "timeframe"]
    },
    handler: async (args, ctx) => {
      if (!ctx.runAutopilotReview) throw new Error("Missing runAutopilotReview handler");
      return ctx.runAutopilotReview(args);
    }
  },
  {
    name: "commit_autopilot_proposal",
    description:
      "Take a previously reviewed Autopilot plan and stage it to the frontend Autopilot Panel.",
    parameters: {
      type: "object",
      properties: {
        plan: { type: "object" },
        source: { type: "string" },
      },
      required: ["plan", "source"],
    },
    handler: async (args, ctx) => {
      return {
        status: "dispatched",
        command: "autopilot_proposal",
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
