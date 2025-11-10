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

// Serve frontend static files (useful if hosting both together)
app.use('/', express.static(path.join(__dirname, '..', 'frontend')));

// Environment variables and secrets
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
const stripe = stripeLib(process.env.STRIPE_SECRET_KEY || 'sk_test_xxx');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Setup Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Email notification helper
function notifyAdmin(subject, text) {
  if (!process.env.SMTP_USER) return;
  transporter
    .sendMail({
      from: process.env.SMTP_USER,
      to: process.env.ADMIN_EMAIL || 'adipotech@gmail.com',
      subject,
      text,
    })
    .catch((e) => console.error('Email error', e));
}

// ===================== DATABASE SETUP =====================
(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    // Create default admin if missing
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
      console.log('Created admin user: admin / adminpass');
    }
    console.log('Database ready');
  } catch (e) {
    console.error('DB init error:', e);
  }
})();

// ===================== JWT HELPERS =====================
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      premium: user.premium,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

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

// ===================== AUTH ROUTES =====================
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'Missing fields' });

    const exists = await User.findOne({ where: { email } });
    if (exists) return res.status(400).json({ error: 'User already exists' });

    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, email, password: hash, role: 'user' });

    res.json({ success: true, message: 'Registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

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
      user: {
        username: user.username,
        role: user.role,
        premium: user.premium,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ===================== CONTENT ROUTES =====================

// Get all contents
app.get('/api/contents', authMiddleware, async (req, res) => {
  const items = await Content.findAll({ order: [['createdAt', 'DESC']] });
  res.json(items);
});

// Post a comment
app.post('/api/comments', authMiddleware, async (req, res) => {
  const { contentId, text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });
  await Comment.create({ userId: req.user.id, contentId, text });
  notifyAdmin('New comment', `User ${req.user.username} commented: ${text}`);
  res.json({ success: true });
});

// ===================== ADMIN ROUTES =====================
const upload = multer({ dest: 'uploads/' });

app.post(
  '/api/admin/upload',
  authMiddleware,
  upload.single('file'),
  async (req, res) => {
    if (!req.user || req.user.role !== 'admin')
      return res.status(403).json({ error: 'Forbidden' });

    const { title, description, type, premium } = req.body;
    const url = '/uploads/' + req.file.filename;
    await Content.create({
      title,
      description,
      type,
      url,
      premium: premium === 'true',
    });
    res.json({ success: true, url });
  }
);

app.get('/api/admin/data', authMiddleware, async (req, res) => {
  if (!req.user || req.user.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden' });
  const contents = await Content.findAll();
  const comments = await Comment.findAll();
  res.json({ contents, comments });
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===================== STRIPE PAYMENTS =====================
app.post('/api/create-checkout-session', authMiddleware, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Adipotech Premium' },
            unit_amount: 500,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url:
        (process.env.FRONTEND_URL || 'http://localhost:3000') +
        '/?payment=success',
      cancel_url:
        (process.env.FRONTEND_URL || 'http://localhost:3000') +
        '/?payment=cancel',
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Stripe error' });
  }
});

// ===================== OPENAI ROUTE =====================
app.post('/api/ai', authMiddleware, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
    });
    const answer =
      response.choices?.[0]?.message?.content ||
      response.choices?.[0]?.text ||
      'No response';
    res.json({ answer });
  } catch (e) {
    console.error('OpenAI error', e);
    res.status(500).json({ error: 'AI error' });
  }
});

// ===================== DEFAULT ROUTE =====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ===================== START SERVER =====================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
