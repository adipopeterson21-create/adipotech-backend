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

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ccaa4e1eed1698eec9645eaf680a62639c823e6e80f40037f66ab888db4af060';
const stripe = stripeLib(process.env.STRIPE_SECRET_KEY || 'sk_test_xxx');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === Database initialization ===
(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
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

// === Auth Routes (DISABLED since no login/register needed) ===
/*
app.post('/api/register', async (req, res) => {
  ...
});

app.post('/api/login', async (req, res) => {
  ...
});
*/

// === Public Route: Anyone can see content now ===
app.get('/api/contents', async (req, res) => {
  try {
    const contents = await Content.findAll({ order: [['createdAt', 'DESC']] });
    res.json(contents);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching content' });
  }
});

// === Comments (still require login, comment out if public commenting wanted) ===
/*
app.post('/api/comments', authMiddleware, async (req, res) => {
  const { contentId, text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });
  await Comment.create({ userId: req.user.id, contentId, text });
  res.json({ success: true });
});
*/

// === Admin upload (keep protected) ===
const upload = multer({ dest: 'uploads/' });
app.post('/api/admin/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.user || req.user.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden' });

  const { title, description, type, premium } = req.body;
  const url = '/uploads/' + req.file.filename;
  await Content.create({ title, description, type, url, premium: premium === 'true' });
  res.json({ success: true, url });
});

// === AI assistant (optional: make public by removing authMiddleware) ===
app.post('/api/ai', /*authMiddleware,*/ async (req, res) => {
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

// === Stripe Checkout (still protected; comment out to disable payments) ===
/*
app.post('/api/create-checkout-session', authMiddleware, async (req, res) => {
  ...
});
*/

// === Serve uploaded files ===
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === Start Server ===
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
