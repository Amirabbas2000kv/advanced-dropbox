const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// General limit for the whole API
exports.apiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: config.rateLimitMax,
  standardHeaders: 'draft-7', // sends RateLimit-* headers so clients know their budget
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Strict limit for login and register (stops password guessing)
exports.authLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: config.authRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again in 15 minutes' },
});