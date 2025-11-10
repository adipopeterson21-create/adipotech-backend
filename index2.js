// continued from index.js (append the rest)
const app2 = app; // continuation placeholder

// === PUBLIC CONTENT: anyone can access ===
// ✅ Public route: anyone can view all uploaded contents
app.get('/api/contents', async (req, res) => {
  try {
    const items = await Content.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(items);
  } catch (err) {
    console.error('Error fetching contents:', err);
    res.status(500).json({ error: 'Failed to fetch contents' });
  }
});


// === Comments (optional: keep protected, or make public) ===
// To allow comments without login, remove `authMiddleware` below.
app.post('/api/comments', /*authMiddleware,*/ async (req, res) => {
  const { contentId, text, username = 'Guest' } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });

  try {
    await Comment.create({
      userId: req.user?.id || null,
      contentId,
      text,
    });
    notifyAdmin('New comment', `User ${req.user?.username || username} commented: ${text}`);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Comment error' });
  }
});

// === Admin upload (KEEP PROTECTED for security) ===
const upload = multer({ dest: 'uploads/' });
app.post('/api/admin/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.user || req.user.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden' });

  try {
    const { title, description, type, premium } = req.body;
    const url = '/uploads/' + req.file.filename;
    await Content.create({ title, description, type, url, premium: premium === 'true' });
    res.json({ success: true, url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// === Stripe checkout (optional - disable if not using) ===
/*
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
*/

// === AI Assistant (make public if you want to remove login) ===
app.post('/api/ai', /*authMiddleware,*/ async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
    });
    const answer = response.choices?.[0]?.message?.content || 'No answer';
    res.json({ answer });
  } catch (e) {
    console.error('OpenAI error', e);
    res.status(500).json({ error: 'AI error' });
  }
});

// === Admin data (KEEP PROTECTED) ===
app.get('/api/admin/data', authMiddleware, async (req, res) => {
  if (!req.user || req.user.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden' });

  const contents = await Content.findAll();
  const comments = await Comment.findAll();
  res.json({ contents, comments });
});

// === Serve uploaded files ===
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === Start server ===
app.listen(PORT, () => {
  console.log('✅ Server started on', PORT);
});
