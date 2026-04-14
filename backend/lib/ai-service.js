// ============================================================
//  AI Saham Analyzer — AI Service Layer
//  Encapsulates all Google Gemini API interaction logic
// ============================================================

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ---- System Prompt (Trading Assistant Persona) ----
const SYSTEM_PROMPT = `Kamu adalah "AI Saham Analyzer", asisten trading saham AI profesional yang ahli di pasar saham Indonesia (IDX/BEI).

PERAN & KEAHLIAN:
- Analisis teknikal dan fundamental saham-saham IDX
- Membaca candlestick patterns, moving averages, RSI, MACD, Bollinger Bands
- Memahami sektor-sektor di BEI: Finansial, Energi, Konsumer, Teknologi, dll.
- Memberikan insight tentang IHSG, LQ45, IDX30

ATURAN RESPONS:
1. Selalu jawab dalam Bahasa Indonesia yang natural dan profesional
2. Gunakan emoji yang relevan untuk membuat respons mudah dibaca (📊📈📉🔥💡⚠️🟢🔴)
3. Berikan data dan analisis yang terstruktur menggunakan bullet points
4. Sertakan disclaimer bahwa ini bukan ajakan beli/jual saham
5. Jika ditanya tentang saham spesifik, berikan analisis terstruktur:
   - Harga dan tren saat ini
   - Level support & resistance
   - Indikator teknikal
   - Rekomendasi (Buy/Hold/Sell) dengan target dan stop loss
   - Risk/reward ratio
6. Jaga respons tetap ringkas tapi informatif (maksimal 300 kata)
7. Jika pertanyaan di luar topik saham/investasi, arahkan kembali ke topik utama dengan sopan

DISCLAIMER WAJIB (tambahkan di akhir setiap rekomendasi):
"⚠️ Disclaimer: Analisis ini bersifat edukatif, bukan ajakan beli/jual. Selalu lakukan riset mandiri (DYOR)."`;

// ---- Singleton Gemini Client ----
let genAI = null;
let model = null;

/**
 * Initialize the Gemini client
 * @param {string} [customApiKey] - Optional custom API key to override the environment variable
 * @returns {{ genAI, model }} initialized client and model
 */
function getClient(customApiKey) {
  // If a custom API key is provided, always create a fresh instance for this request
  if (customApiKey) {
    const customGenAI = new GoogleGenerativeAI(customApiKey);
    const customModel = customGenAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_ONLY_HIGH',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_ONLY_HIGH',
        },
      ],
    });
    return { genAI: customGenAI, model: customModel };
  }

  // Otherwise, use the singleton with environment variable
  if (!model) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      throw new Error(
        'GEMINI_API_KEY is not configured. Get one at https://aistudio.google.com/apikey'
      );
    }
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_ONLY_HIGH',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_ONLY_HIGH',
        },
      ],
    });
  }
  return { genAI, model };
}

/**
 * Send a chat message to Gemini and get a response
 * @param {string} userMessage - The user's prompt
 * @param {Array} history - Previous conversation turns [{role, parts}]
 * @param {string} [customApiKey] - Optional custom API key
 * @returns {Promise<{reply: string, usage: object}>}
 */
async function chat(userMessage, history = [], customApiKey = null) {
  const { model } = getClient(customApiKey);

  // Build chat session with history for multi-turn context
  const chatSession = model.startChat({
    history: history.map((turn) => ({
      role: turn.role,       // 'user' or 'model'
      parts: [{ text: turn.content }],
    })),
  });

  const result = await chatSession.sendMessage(userMessage);
  const response = result.response;

  return {
    reply: response.text(),
    usage: response.usageMetadata || null,
  };
}

module.exports = { chat, SYSTEM_PROMPT };
