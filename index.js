require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const stripeLib = require('stripe');
const nodemailer = require('nodemailer');
const { sequelize, User, Content, Comment } = require('./models');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve frontend static files
app.use('/', express.static(path.join(__dirname, '..', 'frontend')));

// Environment variables and secrets
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || '';
const stripe = stripeLib(process.env.STRIPE_SECRET_KEY || 'sk_test_xxx');

// Initialize OpenAI client with new SDK pattern
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Setup Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Utility to notify admin via email
function notifyAdmin(subject, text) {
  if (!process.env.SMTP_USER) return;
  transporter.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.ADMIN_EMAIL || 'adipotech@gmail.com',
    subject,
    text,
  }).catch(e => console.error('Email error', e));
}

// DB initialization and create default admin if missing
(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    const admin = await User.findOne({ where: { username: 'admin' } });
    if (!admin) {
      const hash = await bcrypt.hash('adminpass', 10);
      await User.create({
        username: 'admin',
        email: 'admin@local',
        password: hash,
        role: 'admin',
        premium: true,
      });
      console.log('Created admin user admin/adminpass');
    }
    console.log('Database ready');
  } catch (e) {
    console.error('DB init error:', e);
  }
})();

// Helper to generate JWT token
function generateToken(user) {
  return jwt.sign({
    id: user.id,
    username: user.username,
    role: user.role,
    premium: user.premium,
  }, JWT_SECRET, { expiresIn: '7d' });
}

// Middleware to authenticate JWT token
async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing authorization' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Registration route
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const exists = await User.findOne({ where: { email } });
    if (exists) return res.status(400).json({ error: 'User exists' });
    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, email, password: hash });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login route
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = generateToken(user);
    res.json({
      success: true,
      token,
      user: { username: user.username, role: user.role, premium: user.premium },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Example OpenAI chat endpoint (protected)
app.post('/api/chat', authMiddleware, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages) return res.status(400).json({ error: 'Missing messages' });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
    });

    res.json(completion);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
