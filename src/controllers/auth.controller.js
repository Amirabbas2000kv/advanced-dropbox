const bcrypt = require('bcryptjs');
const prisma = require('../config/db');

const jwt = require('jsonwebtoken');
const config = require('../config/env');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.register = async (req, res) => {
  try {
    const { email, name, password } = req.body;

    // 1. Validate input
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'email, name and password are required' });
    }
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // 2. Check duplicate email
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // 3. Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Create user
    const user = await prisma.user.create({
      data: { email: normalizedEmail, name: name.trim(), passwordHash },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    // 5. Respond (never send passwordHash)
    return res.status(201).json({ message: 'User registered successfully', user });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    // 2. Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // 3. Check password (same message for both cases)
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
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};