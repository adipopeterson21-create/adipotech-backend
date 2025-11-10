
// continued from index.js (append the rest)
const app2 = app; // just continuation placeholder
// Protected content
app.get('/api/contents', authMiddleware, async (req,res)=>{
  const items = await Content.findAll({ order:[['createdAt','DESC']] });
  res.json(items);
});

// Comments
app.post('/api/comments', authMiddleware, async (req,res)=>{
  const { contentId, text } = req.body;
  if(!text) return res.status(400).json({ error:'Missing text' });
  await Comment.create({ userId: req.user.id, contentId, text });
  notifyAdmin('New comment', `User ${req.user.username} commented: ${text}`);
  res.json({ success:true });
});

// Admin upload (multer) simple local storage (replace with Cloudify in production)
const upload = multer({ dest: 'uploads/' });
app.post('/api/admin/upload', authMiddleware, upload.single('file'), async (req,res)=>{
  if(!req.user || req.user.role!=='admin') return res.status(403).json({ error:'Forbidden' });
  const { title, description, type, premium } = req.body;
  const url = '/uploads/' + req.file.filename;
  await Content.create({ title, description, type, url, premium: premium==='true' });
  res.json({ success:true, url });
});

// Stripe checkout session (test)
app.post('/api/create-checkout-session', authMiddleware, async (req,res)=>{
  try{
    const session = await stripe.checkout.sessions.create({
      payment_method_types:['card'],
      line_items:[{ price_data:{ currency:'usd', product_data:{ name:'Adipotech Premium' }, unit_amount:500 }, quantity:1 }],
      mode:'payment',
      success_url:(process.env.FRONTEND_URL||'http://localhost:3000') + '/?payment=success',
      cancel_url:(process.env.FRONTEND_URL||'http://localhost:3000') + '/?payment=cancel'
    });
    res.json({ url: session.url });
  }catch(e){ console.error(e); res.status(500).json({ error:'Stripe error' }); }
});

// OpenAI proxy for AI assistant
app.post('/api/ai', authMiddleware, async (req,res)=>{
  const { prompt } = req.body;
  if(!prompt) return res.status(400).json({ error:'Missing prompt' });
  try{
    const response = await openai.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role:'user', content: prompt }],
      max_tokens: 800
    });
    const answer = response.data.choices?.[0]?.message?.content || response.data.choices?.[0]?.text;
    res.json({ answer });
  }catch(e){ console.error('OpenAI error', e); res.status(500).json({ error:'AI error' }); }
});

// Admin data
app.get('/api/admin/data', authMiddleware, async (req,res)=>{
  if(!req.user || req.user.role!=='admin') return res.status(403).json({ error:'Forbidden' });
  const contents = await Content.findAll(); const comments = await Comment.findAll();
  res.json({ contents, comments });
});

// Serve uploaded files (simple)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.listen(PORT, ()=>{ console.log('Server started on', PORT); });
