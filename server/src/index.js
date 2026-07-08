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

// Railway terminates TLS at a proxy — needed for correct client IPs (rate limiting)
app.set('trust proxy', 1);

// Webhook must receive the raw Buffer for HMAC signature verification.
// Register path-specific raw-body middleware BEFORE the global express.json()
// so the stream is not pre-consumed on this path.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

// CORS allowlist — production custom domains are always allowed; CLIENT_URL
// (comma-separated) adds any extra origins (Vercel preview URLs, the founder
// dashboard, local dev) on top, without replacing these.
const PRODUCTION_ORIGINS = [
  'https://coacharjun.in',
  'https://www.coacharjun.in',
];

const envOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...PRODUCTION_ORIGINS, ...envOrigins]));

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // explicit preflight handler for every route

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
app.use('/api/user',            require('./routes/userData'));
app.use('/api/streaks',         require('./routes/streaks'));
app.use('/api/payments',        require('./routes/payments'));
app.use('/api/mental-fitness',  require('./routes/mentalFitness'));
app.use('/api/weekly-reports',  require('./routes/weeklyReports'));
app.use('/api/self-talk',       require('./routes/selfTalk'));
app.use('/api/body-reset',      require('./routes/bodyReset'));
app.use('/api/skills',          require('./routes/skills'));
app.use('/api/plan',            require('./routes/plan'));
app.use('/api/founder',         require('./routes/founder'));
app.use('/api/safety',          require('./routes/safety'));

// Health check — useful to confirm the server is running
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Arjun API', version: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`\n🧠 Arjun server running → http://localhost:${PORT}\n`);
});
