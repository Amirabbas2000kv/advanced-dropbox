const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const logger = require('./utils/logger');
const authRoutes = require('./routes/auth.routes');
const fileRoutes = require('./routes/file.routes');
const folderRoutes = require('./routes/folder.routes');
const chunkRoutes = require('./routes/chunk.routes');
const searchRoutes = require('./routes/search.routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();

// Middlewares
app.use(helmet());
app.use(cors());
app.use(
  morgan(':method :url :status :res[content-length] - :response-time ms', {
    stream: { write: (message) => logger.http(message.trim()) },
  })
);
app.use(express.json());

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Advanced Dropbox API is running',
    time: new Date().toISOString(),
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/uploads', chunkRoutes);
app.use('/api/search', searchRoutes);

// 404 handler, then the central error handler (MUST be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;