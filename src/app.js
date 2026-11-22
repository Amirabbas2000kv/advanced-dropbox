const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const authRoutes = require('./routes/auth.routes');

const app = express();

// Middlewares
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app;