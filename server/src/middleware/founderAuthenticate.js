const { verifyFounderSessionToken } = require('../services/founderAuth');

// Guards the new founder SafetyEvent review API with the short-lived
// founder session token (PR-6). Deliberately separate from both athlete
// `authenticate` (JWT_SECRET) and the legacy static-token `founderAuth`
// middleware in routes/founder.js (FOUNDER_TOKEN) — the new review API
// must only ever accept the new session token.
function founderAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  const session = verifyFounderSessionToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.founderSession = session;
  next();
}

module.exports = founderAuthenticate;
