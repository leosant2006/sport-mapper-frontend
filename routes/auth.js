const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const emailValidator = require('email-validator');
const pool = require('../config/database');

const router = express.Router();

// Custom email validation function
const validateEmail = (email) => {
  // Basic email format validation
  if (!emailValidator.validate(email)) {
    return { isValid: false, message: 'Formato email non valido' };
  }

  // Check for common disposable email domains
  const disposableDomains = [
    '10minutemail.com', 'guerrillamail.com', 'tempmail.org', 'mailinator.com',
    'yopmail.com', 'throwaway.email', 'temp-mail.org', 'fakeinbox.com',
    'sharklasers.com', 'getairmail.com', 'mailnesia.com', 'maildrop.cc',
    'tempr.email', 'tmpmail.org', 'tmpeml.com', 'tmpbox.net', 'tmpmail.net',
    'tmpeml.net', 'tmpbox.org', 'tmpmail.com', 'tmpeml.org', 'tmpbox.com'
  ];

  const domain = email.split('@')[1]?.toLowerCase();
  if (disposableDomains.includes(domain)) {
    return { isValid: false, message: 'Email temporanee non sono consentite' };
  }

  // Check for valid email structure
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, message: 'Formato email non valido' };
  }

  return { isValid: true };
};

// Register user
router.post('/register', [
  body('username').isLength({ min: 3 }).trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password } = req.body;

    // Validate email with custom validation
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      return res.status(400).json({ message: emailValidation.message });
    }

    // Check if username already exists
    const usernameExists = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (usernameExists.rows.length > 0) {
      return res.status(400).json({ message: 'Username già esistente' });
    }

    // Check if email already exists
    const emailExists = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (emailExists.rows.length > 0) {
      return res.status(400).json({ message: 'Email già esistente' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const newUser = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, is_admin, created_at',
      [username, email, passwordHash]
    );

    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser.rows[0].id, username: newUser.rows[0].username, is_admin: newUser.rows[0].is_admin },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser.rows[0].id,
        username: newUser.rows[0].username,
        email: newUser.rows[0].email,
        is_admin: newUser.rows[0].is_admin
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login user
router.post('/login', [
  body('username').trim().escape(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    // Find user
    const user = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [username]
    );

    if (user.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.rows[0].id, username: user.rows[0].username, is_admin: user.rows[0].is_admin },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      user: {
        id: user.rows[0].id,
        username: user.rows[0].username,
        email: user.rows[0].email,
        is_admin: user.rows[0].is_admin
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check username availability
router.get('/check-username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username || username.length < 3) {
      return res.json({ available: false, message: 'Username troppo corto' });
    }

    const result = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    res.json({ available: result.rows.length === 0 });
  } catch (error) {
    console.error('Error checking username availability:', error);
    res.status(500).json({ available: false, message: 'Errore del server' });
  }
});

// Check email availability
router.get('/check-email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email || !email.includes('@')) {
      return res.json({ available: false, message: 'Email non valida' });
    }

    const result = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    res.json({ available: result.rows.length === 0 });
  } catch (error) {
    console.error('Error checking email availability:', error);
    res.status(500).json({ available: false, message: 'Errore del server' });
  }
});

module.exports = router;
