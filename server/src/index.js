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
const profileIntroRoutes = require('./routes/profileIntro');
const sessionsRoutes    = require('./routes/sessions');

const app = express();
const PORT = process.env.PORT || 5000;

// Webhook must receive the raw Buffer for HMAC signature verification.
// Register path-specific raw-body middleware BEFORE the global express.json()
// so the stream is not pre-consumed on this path.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

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
app.use('/api/games',         gamesRoutes);
app.use('/api/profile-intro', profileIntroRoutes);
app.use('/api/sessions',        sessionsRoutes);
app.use('/api/user',            require('./routes/cue'));
app.use('/api/user',            require('./routes/userData'));
app.use('/api/streaks',         require('./routes/streaks'));
app.use('/api/payments',        require('./routes/payments'));
app.use('/api/mental-fitness',  require('./routes/mentalFitness'));
app.use('/api/weekly-reports',  require('./routes/weeklyReports'));
app.use('/api/self-talk',       require('./routes/selfTalk'));
app.use('/api/body-reset',      require('./routes/bodyReset'));
app.use('/api/founder',         require('./routes/founder'));

// Health check — useful to confirm the server is running
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Arjun API', version: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`\n🧠 Arjun server running → http://localhost:${PORT}\n`);
});
