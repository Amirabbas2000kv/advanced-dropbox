const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Pretty format for the terminal
const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: time, stack }) => `${time} ${level}: ${stack || message}`)
);

// JSON format for files (easy to search and parse later)
const fileFormat = combine(timestamp(), errors({ stack: true }), json());

const logger = winston.createLogger({
  level: config.nodeEnv === 'production' ? 'info' : 'http',
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: fileFormat,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'app.log'),
      format: fileFormat,
    }),
  ],
});

module.exports = logger;