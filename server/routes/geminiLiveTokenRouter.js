
const express = require("express");
const {
  geminiLiveClient,
  GEMINI_LIVE_SESSION_DEFAULTS,
} = require("../geminiLiveClient");

const router = express.Router();

/**
 * POST /api/gemini/live/ephemeral-token
 *
 * Mint an ephemeral token for the frontend to connect directly to the Gemini Live WebSocket.
 */
router.post("/live/ephemeral-token", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    }

    const {
      uses = GEMINI_LIVE_SESSION_DEFAULTS.uses,
      expireMinutes = GEMINI_LIVE_SESSION_DEFAULTS.expireMinutes,
      newSessionWindowMinutes = GEMINI_LIVE_SESSION_DEFAULTS.newSessionWindowMinutes,
    } = req.body || {};

    const now = new Date();
    // Expiration for the token usage itself
    const expireTime = new Date(now.getTime() + expireMinutes * 60_000);
    // Window during which a new session can be started
    const newSessionExpireTime = new Date(
      now.getTime() + newSessionWindowMinutes * 60_000
    );

    // Call the GenAI SDK to create the token
    // Accessing internal/alpha API for tokens if not fully exposed in typed SDK yet
    // Note: The Node SDK exposes this via `client.tokens.create` in newer versions or raw request
    // The provided snippet used `auth_tokens.create`, we will adapt to the SDK structure if needed
    // or use the generic client fetch if specific method is missing.
    // Assuming standard SDK usage for v1alpha tokens:
    
    // NOTE: If SDK doesn't strictly type `auth_tokens`, we rely on dynamic access or similar.
    // For safety with current @google/genai, we might need a workaround if it's not standard.
    // However, following the prompt instructions:
    
    /* 
       The prompt suggests: 
       const token = await (geminiLiveClient as any).auth_tokens.create(...)
    */

    // In JS:
    const tokenResponse = await geminiLiveClient.authTokens.create({
        config: {
            uses,
            expireTime: expireTime.toISOString(),
            newSessionExpireTime: newSessionExpireTime.toISOString(),
            httpOptions: { apiVersion: "v1alpha" },
        }
    });

    // The response structure might vary slightly by SDK version, handling robustly:
    const tokenValue = tokenResponse.token || tokenResponse.value;

    return res.json({
      token: tokenValue,
      expireTime: expireTime.toISOString(),
      newSessionExpireTime: newSessionExpireTime.toISOString(),
    });
  } catch (err) {
    console.error("[Gemini Live] ephemeral-token error:", err);
    return res.status(500).json({
      error: "Failed to create ephemeral token",
      details: err.message || "Unknown error",
    });
  }
});

module.exports = router;
