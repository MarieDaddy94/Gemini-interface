// server/ai-providers.js
const OpenAI = require('openai');
const { GoogleGenAI } = require('@google/genai');
const { TOOL_SPECS } = require('./ai-config');

// Initialize Providers
// Note: Frontend instructions mentioned process.env.API_KEY, but backend often uses specifics.
// We fallback to standard env vars.
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-build' 
});

const gemini = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || 'dummy-key-for-build' 
});

// --- HELPER: Tool Conversion ---

function getOpenAiTools(agentTools) {
  return TOOL_SPECS
    .filter(t => agentTools.includes(t.name))
    .map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema
      }
    }));
}

function getGeminiTools(agentTools) {
  const funcs = TOOL_SPECS
    .filter(t => agentTools.includes(t.name))
    .map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema
    }));
  
  if (funcs.length === 0) return undefined;
  // Gemini expects tools: [{ functionDeclarations: [...] }]
  return [{ functionDeclarations: funcs }];
}

// --- OPENAI HANDLER ---

async function callOpenAiWithTools(req, agent, toolRunner) {
  // Build Messages
  const messages = [
    { role: 'system', content: agent.systemPrompt },
    ...req.messages.map(m => {
      // Basic text mapping
      if (m.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.toolCallId,
          content: m.content
        };
      }
      return { role: m.role, content: m.content };
    })
  ];

  // Vision insertion into the last user message if present
  if (req.vision && agent.usesVision) {
    const lastUserIdx = messages.findLastIndex(m => m.role === 'user');
    if (lastUserIdx !== -1) {
      const oldContent = messages[lastUserIdx].content;
      messages[lastUserIdx].content = [
        { type: 'text', text: typeof oldContent === 'string' ? oldContent : '' },
        {
          type: 'image_url',
          image_url: {
            url: `data:${req.vision.mimeType};base64,${req.vision.dataBase64}`
          }
        }
      ];
    }
  }

  const tools = getOpenAiTools(agent.tools);

  // 1st Call
  const completion = await openai.chat.completions.create({
    model: agent.model,
    messages: messages,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? 'auto' : undefined
  });

  const choice = completion.choices[0];
  const responseMsg = choice.message;

  // If tool calls
  if (responseMsg.tool_calls) {
    // Append Assistant's intent
    messages.push(responseMsg);
    
    const toolCallsArr = [];

    for (const tc of responseMsg.tool_calls) {
      const toolName = tc.function.name;
      const args = JSON.parse(tc.function.arguments);
      
      // Run Tool
      let result = 'Error: Tool not found';
      try {
        result = await toolRunner(toolName, args);
      } catch (e) {
        result = `Error executing tool: ${e.message}`;
      }

      // Add to history
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: String(result)
      });
      
      toolCallsArr.push({
        id: tc.id,
        name: toolName,
        arguments: args
      });
    }

    // 2nd Call (Final Answer)
    const secondCompletion = await openai.chat.completions.create({
      model: agent.model,
      messages: messages
    });
    
    return {
      finalMessage: {
        role: 'assistant',
        content: secondCompletion.choices[0].message.content || ''
      },
      toolCalls: toolCallsArr
    };
  }

  return {
    finalMessage: {
      role: 'assistant',
      content: responseMsg.content || ''
    }
  };
}

// --- GEMINI HANDLER ---

async function callGeminiWithTools(req, agent, toolRunner) {
  // Gemini needs specific structure
  const model = gemini.models.getGenerativeModel({
    model: agent.model
  });

  const tools = getGeminiTools(agent.tools);
  
  // Convert messages to Gemini format
  // Note: Gemini SDK handles history management differently for chat, 
  // but generateContent can take a list of contents.
  const contents = [];

  // System instructions are passed in config, not as a message in contents usually,
  // but for simple turn-based we rely on `systemInstruction` config if supported, 
  // or prepend to first user message.
  
  // Prepend system prompt to the first message effectively? 
  // Or utilize systemInstruction config in generateContent (supported in v1beta).
  
  for (const m of req.messages) {
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content }] });
    } else if (m.role === 'assistant') {
      contents.push({ role: 'model', parts: [{ text: m.content }] });
    }
    // Note: 'tool' role handling in Gemini is strict; usually involves `functionResponse` parts.
    // For simplicity in this unified router, we might drop old tool outputs if not strictly required
    // or we'd need to reconstruct the full `functionCall` -> `functionResponse` chain.
    // For this implementation, we will pass text history.
  }

  // Vision
  if (req.vision && agent.usesVision) {
     const lastUser = contents[contents.length - 1];
     if (lastUser && lastUser.role === 'user') {
       lastUser.parts.push({
         inlineData: {
           mimeType: req.vision.mimeType,
           data: req.vision.dataBase64
         }
       });
     }
  }

  const chat = model.startChat({
    history: contents.slice(0, -1), // Everything but last
    systemInstruction: agent.systemPrompt,
    tools: tools
  });

  // Send last message
  const lastMsg = contents[contents.length - 1];
  const result = await chat.sendMessage(lastMsg.parts);
  const response = result.response;
  
  // Handle Function Calls
  // Gemini returns functionCalls in the response candidates
  const calls = response.functionCalls();
  
  if (calls && calls.length > 0) {
    const toolCallsInfo = [];
    const functionResponses = [];

    for (const call of calls) {
      const toolName = call.name;
      const args = call.args;
      
      let output = 'Error';
      try {
        output = await toolRunner(toolName, args);
      } catch (e) {
        output = `Error: ${e.message}`;
      }

      toolCallsInfo.push({
        id: 'gemini-call', // Gemini doesn't always expose IDs same way OpenAI does
        name: toolName,
        arguments: args
      });

      functionResponses.push({
        name: toolName,
        response: { result: output }
      });
    }

    // Send results back
    const finalResult = await chat.sendMessage(functionResponses);
    
    return {
      finalMessage: {
        role: 'assistant',
        content: finalResult.response.text()
      },
      toolCalls: toolCallsInfo
    };
  }

  return {
    finalMessage: {
      role: 'assistant',
      content: response.text()
    }
  };
}

module.exports = { callOpenAiWithTools, callGeminiWithTools };
