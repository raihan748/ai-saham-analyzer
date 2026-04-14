// ============================================================
//  AI Saham Analyzer — Express Server
//  Main entry point for local development and Vercel deployment
// ============================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const aiService = require('./lib/ai-service');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// ============================================================
//  MIDDLEWARE
// ============================================================

// Security headers
app.use(helmet());

// CORS — allow the Chrome extension and any configured origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map((o) => o.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (extensions, curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parsing
app.use(express.json({ limit: '16kb' }));

// Rate limiting — protect against abuse (60 requests/min per IP)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: IS_PROD ? 30 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Terlalu banyak permintaan. Silakan coba lagi dalam 1 menit.',
  },
});
app.use('/api/', limiter);

// Request logging (non-production)
if (!IS_PROD) {
  app.use((req, _res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
  });
}

// ============================================================
//  ROUTES
// ============================================================

// ---- Health Check ----
app.get('/', (_req, res) => {
  res.json({
    name: 'AI Saham Analyzer API',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ---- Chat Endpoint ----
/**
 * POST /api/chat
 *
 * Request body:
 * {
 *   "message": "Analisis saham BBRI",
 *   "history": [                        // optional, for multi-turn
 *     { "role": "user", "content": "..." },
 *     { "role": "model", "content": "..." }
 *   ]
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "reply": "...",
 *     "usage": { ... }
 *   }
 * }
 */
app.post('/api/chat', async (req, res) => {
  try {
    // --- Input validation ---
    const { message, history, apiKey } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Field "message" wajib diisi dan harus berupa string.',
      });
    }

    const trimmed = message.trim();
    if (trimmed.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Pesan tidak boleh kosong.',
      });
    }

    if (trimmed.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Pesan terlalu panjang. Maksimal 2000 karakter.',
      });
    }

    // Validate history format if provided
    const chatHistory = Array.isArray(history)
      ? history
          .filter(
            (h) =>
              h &&
              typeof h.role === 'string' &&
              typeof h.content === 'string' &&
              ['user', 'model'].includes(h.role)
          )
          .slice(-20) // Keep last 20 turns max to manage token budget
      : [];

    // --- Call AI service ---
    const result = await aiService.chat(trimmed, chatHistory, apiKey);

    return res.json({
      success: true,
      data: {
        reply: result.reply,
        usage: result.usage,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[/api/chat] Error:', error.message);

    // Differentiate error types for clearer client feedback
    if (error.message.includes('GEMINI_API_KEY')) {
      return res.status(503).json({
        success: false,
        error: 'Layanan AI belum dikonfigurasi. Hubungi administrator.',
      });
    }

    if (error.message.includes('quota') || error.message.includes('429')) {
      return res.status(429).json({
        success: false,
        error: 'Kuota API habis. Silakan coba lagi nanti.',
      });
    }

    if (error.message.includes('SAFETY')) {
      return res.status(400).json({
        success: false,
        error: 'Pesan tidak dapat diproses karena alasan keamanan. Coba ubah pertanyaan Anda.',
      });
    }

    return res.status(500).json({
      success: false,
      error: IS_PROD
        ? 'Terjadi kesalahan internal. Silakan coba lagi.'
        : error.message,
    });
  }
});

// ============================================================
//  404 HANDLER
// ============================================================
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint tidak ditemukan.',
  });
});

// ============================================================
//  GLOBAL ERROR HANDLER
// ============================================================
app.use((err, _req, res, _next) => {
  console.error('[Global Error]', err.stack);
  res.status(500).json({
    success: false,
    error: IS_PROD
      ? 'Terjadi kesalahan internal.'
      : err.message,
  });
});

// ============================================================
//  START SERVER (local dev only — Vercel uses the export)
// ============================================================
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log('');
    console.log('  🚀 AI Saham Analyzer API');
    console.log(`  ├─ Local:   http://localhost:${PORT}`);
    console.log(`  ├─ Health:  http://localhost:${PORT}/api/health`);
    console.log(`  ├─ Chat:    POST http://localhost:${PORT}/api/chat`);
    console.log(`  └─ Mode:    ${IS_PROD ? 'Production' : 'Development'}`);
    console.log('');
  });
}

// Export for Vercel serverless
module.exports = app;
