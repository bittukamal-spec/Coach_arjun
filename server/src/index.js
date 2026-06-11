require('dotenv').config();
const express = require('express');
const cors = require('cors');
const passport = require('passport');

require('./config/passport'); // Register Google OAuth strategy

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(passport.initialize());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

// Health check — useful to confirm the server is running
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'MindGame API', version: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`\n🧠 MindGame server running → http://localhost:${PORT}\n`);
});
