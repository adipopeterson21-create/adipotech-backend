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

// Environment variables and secrets
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ccaa4e1eed1698eec9645eaf680a62639c823e6e80f40037f66ab888db4af060';
const stripe = stripeLib(process.env.STRIPE_SECRET_KEY || 'sk_test_xxx');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

// === Database initialization and admin user setup ===
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
      console.log('Created admin user: admin/adminpass');
    }
    console.log('Database ready');
  } catch (e) {
    console.error('DB init error:', e);
  }
})();

// === Helpers ===
function generateToken(user) {
  return jwt.sign({
    id: user.id,
    username: user.username,
    role: user.role,
    premium: user.premium,
  }, JWT_SECRET, { expiresIn: '7d' });
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

// === Auth Routes ===
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'Missing fields' });

    const exists = await User.findOne({ where: { email } });
    if (exists) return res.status(400).json({ error: 'User already exists' });

    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, email, password: hash });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
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
      user: { username: user.username, role: user.role, premium: user.premium },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// === Protected Routes ===
app.get('/api/contents', authMiddleware, async (req, res) => {
  try {
    const contents = await Content.findAll({ order: [['createdAt', 'DESC']] });
    res.json(contents);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching content' });
  }
});

app.post('/api/comments', authMiddleware, async (req, res) => {
  const { contentId, text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });
  await Comment.create({ userId: req.user.id, contentId, text });
  notifyAdmin('New comment', `User ${req.user.username} commented: ${text}`);
  res.json({ success: true });
});

const upload = multer({ dest: 'uploads/' });
app.post('/api/admin/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.user || req.user.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden' });

  const { title, description, type, premium } = req.body;
  const url = '/uploads/' + req.file.filename;
  await Content.create({ title, description, type, url, premium: premium === 'true' });
  res.json({ success: true, url });
});

app.post('/api/ai', authMiddleware, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
    });

    const answer = completion.choices?.[0]?.message?.content || 'No answer';
    res.json({ answer });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'AI error' });
  }
});

// === Stripe Checkout ===
app.post('/api/create-checkout-session', authMiddleware, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Adipotech Premium' },
          unit_amount: 500,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: (process.env.FRONTEND_URL || 'http://localhost:3000') + '/?payment=success',
      cancel_url: (process.env.FRONTEND_URL || 'http://localhost:3000') + '/?payment=cancel',
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Stripe error' });
  }
});

// === Serve uploaded files ===
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === Start Server ===
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
