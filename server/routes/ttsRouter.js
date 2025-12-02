
const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require("@google/genai");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.API_KEY;

// POST /api/gemini/tts
router.post('/gemini/tts', async (req, res) => {
  try {
    const { text, voicePreset } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });

    // Using Gemini TTS (Flash Audio)
    const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    // Note: Model availability varies. Using a preview model known for audio generation.
    const modelId = "gemini-2.5-flash-preview-tts"; 

    const response = await client.models.generateContent({
      model: modelId,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voicePreset || "Aoede" // Default voice
            }
          }
        }
      }
    });

    // Extract audio bytes from response
    const audioPart = response.candidates?.[0]?.content?.parts?.[0];
    if (audioPart?.inlineData?.data) {
        // Returns base64 PCM. Default sample rate is usually 24000 for Gemini models.
        return res.json({
            base64Pcm: audioPart.inlineData.data,
            sampleRate: 24000
        });
    }

    res.status(500).json({ error: "No audio generated" });

  } catch (err) {
    console.error("Gemini TTS Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/openai/tts
router.post('/openai/tts', async (req, res) => {
  try {
    const { text, voice } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });

    if (!OPENAI_API_KEY) return res.status(500).json({ error: "OpenAI Key missing" });

    const fetchResponse = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: voice || "alloy",
        response_format: "pcm" // We want raw PCM for the voiceBus
      })
    });

    if (!fetchResponse.ok) {
        const txt = await fetchResponse.text();
        throw new Error(`OpenAI TTS failed: ${txt}`);
    }

    // OpenAI returns raw PCM bytes (16-bit, 24kHz usually for tts-1?)
    // Actually tts-1 pcm is 24kHz signed 16-bit little-endian
    const arrayBuffer = await fetchResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Pcm = buffer.toString('base64');

    res.json({
        base64Pcm,
        sampleRate: 24000 // tts-1 PCM default
    });

  } catch (err) {
    console.error("OpenAI TTS Error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
