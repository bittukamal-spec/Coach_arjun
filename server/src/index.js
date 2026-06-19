require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes        = require('./routes/auth');
const chatRoutes        = require('./routes/chat');
const checkinRoutes     = require('./routes/checkin');
const progressRoutes    = require('./routes/progress');
const achievementRoutes = require('./routes/achievements');
const drillRoutes       = require('./routes/drills');
const ritualRoutes      = require('./routes/ritual');
const debriefRoutes     = require('./routes/debrief');
const gamesRoutes       = require('./routes/games');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

app.use(cors({ origin: true, credentials: true }));

// Routes
app.use('/api/auth',         authRoutes);
app.use('/api/chat',         chatRoutes);
app.use('/api/checkin',      checkinRoutes);
app.use('/api/progress',     progressRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/drills',       drillRoutes);
app.use('/api/ritual',       ritualRoutes);
app.use('/api/debrief',      debriefRoutes);
app.use('/api/games',        gamesRoutes);

// Health check — useful to confirm the server is running
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Arjun API', version: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`\n🧠 MindGame server running → http://localhost:${PORT}\n`);
});
