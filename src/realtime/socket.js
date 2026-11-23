const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const prisma = require('../config/db');
const logger = require('../utils/logger');

let io = null;

// Attach Socket.IO to the HTTP server
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: true },
  });

  // Every connection must send a valid JWT:  io(url, { auth: { token } })
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication token is missing'));

      const payload = jwt.verify(token, config.jwtSecret);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true },
      });
      if (!user) return next(new Error('User no longer exists'));

      socket.userId = user.id;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    // Each user has a private room, so events never reach other users
    socket.join(`user:${socket.userId}`);
    logger.info(`Socket connected (user ${socket.userId})`);

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected (user ${socket.userId})`);
    });
  });

  return io;
};

// Send an event to all devices of one user. Does nothing if sockets are not started.
const emitToUser = (userId, event, data) => {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
};

module.exports = { initSocket, emitToUser };