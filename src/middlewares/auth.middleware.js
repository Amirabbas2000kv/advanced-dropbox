const jwt = require('jsonwebtoken');
const config = require('../config/env');
const prisma = require('../config/db');

module.exports = async (req, res, next) => {
  try {
    // 1. Read the Authorization header: "Bearer <token>"
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication token is missing' });
    }
    const token = header.split(' ')[1];

    // 2. Verify the token signature and expiry
    const payload = jwt.verify(token, config.jwtSecret);

    // 3. Make sure the user still exists
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    // 4. Attach user to the request for the next handlers
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};