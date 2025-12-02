
const express = require("express");
const router = express.Router();

/**
 * POST /api/openai/realtime-token
 * 
 * Generates an ephemeral session token for the OpenAI Realtime API.
 * The frontend uses this to connect via WebRTC using the Agents SDK.
 */
router.post("/realtime-token", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
    }

    // Default to a known realtime model (e.g. gpt-4o-realtime-preview) if not specified
    const model = req.body?.model || "gpt-4o-realtime-preview-2024-12-17";

    // Standard Realtime API endpoint to create a session
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          voice: "verse", // Default voice
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("[realtime-token] OpenAI error:", text);
      return res
        .status(500)
        .json({ error: "Failed to create realtime session" });
    }

    const json = await response.json();
    
    // The client_secret.value is the ephemeral key needed by the frontend
    if (!json.client_secret || !json.client_secret.value) {
       console.error("[realtime-token] No client_secret returned", json);
       return res.status(500).json({ error: "Invalid response from OpenAI" });
    }

    return res.json({
      key: json.client_secret.value,
      expiresAt: json.client_secret.expires_at,
      model,
    });
  } catch (err) {
    console.error("[realtime-token] Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
