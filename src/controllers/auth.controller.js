const bcrypt = require('bcryptjs');
const prisma = require('../config/db');

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