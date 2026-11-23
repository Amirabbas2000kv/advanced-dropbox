const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const config = require('../config/env');
const logger = require('../utils/logger');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
const MAX_NAME = 100;
const MAX_PASSWORD = 72; // bcrypt ignores everything after 72 bytes

exports.register = async (req, res) => {
  try {
    const { email, name, password } = req.body;

    // 1. Validate input (types first: a client could send numbers or objects)
    if (typeof email !== 'string' || typeof name !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'email, name and password are required (as text)' });
    }
    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim();

    if (!cleanEmail || !cleanName || !password) {
      return res.status(400).json({ error: 'email, name and password are required' });
    }
    if (cleanEmail.length > MAX_EMAIL || !emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (cleanName.length > MAX_NAME) {
      return res.status(400).json({ error: `Name is too long (max ${MAX_NAME} characters)` });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (Buffer.byteLength(password) > MAX_PASSWORD) {
      return res.status(400).json({ error: `Password is too long (max ${MAX_PASSWORD} bytes)` });
    }

    // 2. Check duplicate email
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // 3. Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Create user
    const user = await prisma.user.create({
      data: { email: cleanEmail, name: cleanName, passwordHash },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    // 5. Respond (never send passwordHash)
    return res.status(201).json({ message: 'User registered successfully', user });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate input
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    // 2. Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // 3. Check password (same message for both cases, so attackers can't tell which was wrong)
    const isValid = user && (await bcrypt.compare(password, user.passwordHash));
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // 4. Create token
    const token = jwt.sign({ userId: user.id }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    // 5. Respond
    return res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.me = async (req, res) => {
  return res.json({ user: req.user });
};