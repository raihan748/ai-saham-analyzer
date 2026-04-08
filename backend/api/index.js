// ============================================================
//  Vercel Serverless Entry Point
//  Re-exports the Express app for Vercel's Node.js runtime
// ============================================================

const app = require('../server');
module.exports = app;
