require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes     = require('./routes/auth');
const chatRoutes     = require('./routes/chat');
const checkinRoutes  = require('./routes/checkin');
const progressRoutes = require('./routes/progress');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // allow requests with no origin (e.g. curl, mobile) and listed origins
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
  })
);

// Routes
app.use('/api/auth',     authRoutes);
app.use('/api/chat',     chatRoutes);
app.use('/api/checkin',  checkinRoutes);
app.use('/api/progress', progressRoutes);

// Health check — useful to confirm the server is running
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'MindGame API', version: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`\n🧠 MindGame server running → http://localhost:${PORT}\n`);
});
