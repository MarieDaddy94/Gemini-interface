
const { WebSocketServer, WebSocket } = require("ws");

const MODEL =
  process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview-2024-12-17";

// This is the actual OpenAI Realtime WS endpoint
const OPENAI_REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
  MODEL
)}`;

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "[OpenAIRealtimeProxy] WARNING: OPENAI_API_KEY is not set. " +
      "Realtime relay will fail to connect."
  );
}

/**
 * Attach a WebSocket endpoint at:
 *   ws(s)://<your-host>/ws/openai-realtime
 *
 * Browser ↔ proxy: raw WS frames
 * Proxy ↔ OpenAI: WS with Authorization + OpenAI-Beta header
 *
 * The proxy does **no** schema logic. It just pipes bytes both ways.
 * That means your frontend client should speak the standard Realtime
 * events (session.update, input_text, response.create, etc.).
 */
function attachOpenAIRealtimeProxy(server) {
  const wss = new WebSocketServer({ noServer: true });

  // Upgrade only for our realtime path
  server.on("upgrade", (req, socket, head) => {
    if (!req.url) return;
    
    // Check if path matches (using startsWith to be safe or exact match)
    const pathname = req.url.split('?')[0];
    if (pathname === "/ws/openai-realtime") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  wss.on("connection", (browserSocket) => {
    console.log("[OpenAIRealtimeProxy] Browser client connected");

    // Open upstream connection to OpenAI Realtime
    const upstream = new WebSocket(OPENAI_REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    // --- Upstream → Browser -------------------------------------------------
    upstream.on("open", () => {
      console.log("[OpenAIRealtimeProxy] Connected to OpenAI Realtime");
    });

    upstream.on("message", (data) => {
      if (browserSocket.readyState === WebSocket.OPEN) {
        // Just forward exactly what OpenAI sent
        browserSocket.send(data);
      }
    });

    upstream.on("close", (code, reason) => {
      console.log(
        "[OpenAIRealtimeProxy] Upstream closed",
        code,
        reason.toString()
      );
      if (browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.close();
      }
    });

    upstream.on("error", (err) => {
      console.error("[OpenAIRealtimeProxy] Upstream error", err.message);
      if (browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.send(
          JSON.stringify({
            type: "error",
            source: "upstream",
            message: "Error talking to OpenAI Realtime",
          })
        );
        browserSocket.close();
      }
    });

    // --- Browser → Upstream -------------------------------------------------
    browserSocket.on("message", (data) => {
      if (upstream.readyState === WebSocket.OPEN) {
        // Forward whatever the browser sends (JSON Realtime events)
        upstream.send(data);
      }
    });

    browserSocket.on("close", () => {
      console.log("[OpenAIRealtimeProxy] Browser closed");
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.close();
      }
    });

    browserSocket.on("error", (err) => {
      console.error("[OpenAIRealtimeProxy] Browser WS error", err.message);
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.close();
      }
    });
  });
}

module.exports = { attachOpenAIRealtimeProxy };
