'use strict';

// Vercel Serverless Function — Khatwa Platform
// This file is the entry point for all API routes on Vercel.
// Dependencies are resolved from the root node_modules (installed at build time).
const app = require('../backend/dist/app');
module.exports = app.default ?? app;
