const multer = require('multer');
const logger = require('../utils/logger');

// 404 for unknown routes
exports.notFound = (req, res) => {
  res.status(404).json({ error: 'Route not found' });
};

// Central error handler (Express recognizes it by the 4 parameters)
exports.errorHandler = (err, req, res, next) => {
  // If the response already started, let Express close the connection
  if (res.headersSent) return next(err);

  let status = err.status || err.statusCode || 500;
  let message = err.message;

  if (err.type === 'entity.parse.failed') {
    // Malformed JSON in the request body
    status = 400;
    message = 'Invalid JSON in request body';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Invalid or expired token';
  } else if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') {
      status = 409;
      message = 'Resource already exists';
    } else if (err.code === 'P2025') {
      status = 404;
      message = 'Record not found';
    } else {
      status = 500;
    }
  }

  const meta = { method: req.method, url: req.originalUrl, userId: req.user ? req.user.id : null };

  if (status >= 500) {
    // Real server bug: log everything, but never leak details to the client
    logger.error(err.stack || err.message, meta);
    message = 'Internal server error';
  } else {
    logger.warn(`${status} ${message}`, meta);
  }

  res.status(status).json({ error: message });
};