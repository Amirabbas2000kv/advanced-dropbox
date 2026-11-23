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
const shareRoutes = require('./routes/share.routes');
const collabRoutes = require('./routes/collab.routes');
const shareController = require('./controllers/share.controller');
const { apiLimiter } = require('./middlewares/rate-limit.middleware');
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
app.use('/api', apiLimiter);
app.use(express.json());

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Advanced Dropbox API is running',
    time: new Date().toISOString(),
  });
});

// Public route (no login): download through a share link
app.get('/api/public/:token', shareController.publicDownload);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/uploads', chunkRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/collab', collabRoutes);

// 404 handler, then the central error handler (MUST be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;