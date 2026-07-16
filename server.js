require('dotenv').config();
const Sentry  = require('@sentry/node');
const express = require('express');
const helmet  = require('helmet');
const path    = require('path');
const fs      = require('fs');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV || 'production',
});
const TRAMPIT_DB_PATH = path.join(__dirname, 'data', 'trampitPointsDb.v4.json');
let _dbCache = null;
function loadTrampitDb() {
  if (!_dbCache) _dbCache = JSON.parse(fs.readFileSync(TRAMPIT_DB_PATH, 'utf8'));
  return _dbCache;
}
const { evaluateRouteDecision } = require('./data/evaluateRouteDecision');
const { destinationMatchesCity } = require('./data/normalizeCity');
const store = require('./data/store');
const app     = express();

app.set('trust proxy', 1);

// ─── Health check — ללא auth, לזיהוי cold start על Render ───────────────────
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now(), v: 4 }));

const IS_PROD      = process.env.NODE_ENV === 'production';
const ALLOWED_HOST = process.env.ALLOWED_HOST || null; // למשל: trampit.app

// ─── HTTPS redirect (production בלבד) ────────────────────────────────────────
if (IS_PROD) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// ─── CORS lockdown — API רק מה-origin של האפליקציה עצמה ─────────────────────
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  const host   = req.headers.host;

  // בקשות ישירות מהדפדפן (same-origin) — אין origin header, מותר
  if (!origin) return next();

  // בפיתוח — מאפשרים localhost בכל פורט
  if (!IS_PROD && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return next();

  // בproduction — מאפשרים רק את ה-host של השרת עצמו
  const expectedOrigin = ALLOWED_HOST
    ? `https://${ALLOWED_HOST}`
    : `https://${host}`;

  if (origin !== expectedOrigin) {
    secLog('CORS_BLOCK', req, `origin=${origin}`);
    return res.status(403).json({ error: 'גישה אסורה' });
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/client'],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com/gsi/style'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:', 'https://*.tile.openstreetmap.org', 'https://server.arcgisonline.com', 'https://unpkg.com'],
      connectSrc: ["'self'", 'https://accounts.google.com/gsi/'],
      frameSrc:   ['https://accounts.google.com/gsi/'],
    },
  },
}));

// body parser
app.use('/api/analyze',            express.json({ limit: '8mb' }));
app.use('/api/analyze-waze-image', express.json({ limit: '12mb' }));
app.use('/api/login',              express.json({ limit: '1kb' }));
// בprod — מגיש את ה-React build; בdev — Vite על פורט 5173 עושה את זה
const STATIC_DIR = IS_PROD
  ? path.join(__dirname, 'client', 'dist')
  : path.join(__dirname, 'public');
app.use(express.static(STATIC_DIR));

// ─── Security logging ────────────────────────────────────────────────────────
function secLog(type, req, extra = '') {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const ts = new Date().toISOString();
  console.warn(`[SECURITY] ${ts} | ${type} | ip=${ip} | ${req.method} ${req.path}${extra ? ' | ' + extra : ''}`);
}

// ─── Rate limiting פר IP ────────────────────────────────────────────────────
const rateLimitMap = new Map();

const RATE_LIMITS = {
  analyze:     { maxRequests: 10, windowMs: 60 * 1000 },
  transit:     { maxRequests: 30, windowMs: 60 * 1000 },
  cities:      { maxRequests: 20, windowMs: 60 * 1000 },
  login:       { maxRequests: 5,  windowMs: 60 * 1000 },
  spots:       { maxRequests: 3,  windowMs: 5 * 60 * 1000 },
  confirmSpot: { maxRequests: 10, windowMs: 5 * 60 * 1000 },
  decision:    { maxRequests: 20, windowMs: 60 * 1000 },
};

// מנקה entries ישנים כל 5 דקות כדי למנוע דליפת זיכרון
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [ip, entry] of rateLimitMap) {
    if (entry.windowStart < cutoff) rateLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);

function makeRateLimit(tier) {
  const { maxRequests, windowMs } = RATE_LIMITS[tier];
  return function rateLimit(req, res, next) {
    const ip  = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const key = `${tier}:${ip}`;
    const entry = rateLimitMap.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      rateLimitMap.set(key, { count: 1, windowStart: now });
      return next();
    }

    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((windowMs - (now - entry.windowStart)) / 1000);
      res.setHeader('Retry-After', retryAfter);
      secLog('RATE_LIMIT', req, `tier=${tier}`);
      return res.status(429).json({ error: `יותר מדי בקשות — נסה שוב בעוד ${retryAfter} שניות` });
    }

    entry.count++;
    next();
  };
}

// ─── Session auth + user accounts ────────────────────────────────────────────
const crypto        = require('crypto');
const COOKIE_SECRET = process.env.COOKIE_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE_NAME   = 'trampit_sid';
const SESSION_TTL   = 30 * 24 * 60 * 60 * 1000; // 30 יום — חשבונות אישיים, לא מנתקים כל יום
const ADMIN_EMAILS  = (process.env.ADMIN_EMAILS || 'kingkalla26@gmail.com,trempit01@gmail.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const sessions = new Map(); // token → { exp, email }

// טעינת sessions שמורים (store — Postgres או קובץ) בהפעלה; נקרא אחרי store.init()
function loadPersistedSessions() {
  const data = store.get('sessions', {});
  const now  = Date.now();
  let loaded = 0;
  for (const [token, val] of Object.entries(data)) {
    // תאימות לאחור: בגרסה הקודמת הערך היה מספר (exp בלבד, ללא משתמש)
    const sess = typeof val === 'number' ? { exp: val, email: null } : val;
    if (sess.exp > now) { sessions.set(token, sess); loaded++; }
  }
  if (loaded > 0) console.log(`[sessions] loaded ${loaded} active sessions`);
}

function persistSessions() {
  store.set('sessions', Object.fromEntries(sessions));
}

// ─── Users ────────────────────────────────────────────────────────────────────
function loadUsers() {
  return store.get('users', {});
}

function saveUsers(users) {
  store.set('users', users);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[֐-׿a-zA-Z0-9 _.\-]{2,30}$/;

function issueSession(res, email) {
  const token = crypto.randomBytes(24).toString('hex');
  const sig   = crypto.createHmac('sha256', COOKIE_SECRET).update(token).digest('hex');
  sessions.set(token, { exp: Date.now() + SESSION_TTL, email: email || null });
  persistSessions();
  res.cookie(COOKIE_NAME, `${token}.${sig}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD,
    maxAge: SESSION_TTL,
  });
}

// מחזיר את ה-session ({ exp, email }) או null
function validateSession(req) {
  const raw = req.headers.cookie?.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))?.[1];
  if (!raw) return null;
  const dotIdx = raw.lastIndexOf('.');
  if (dotIdx === -1) return null;
  const token = raw.slice(0, dotIdx);
  const sig   = raw.slice(dotIdx + 1);
  const expected = crypto.createHmac('sha256', COOKIE_SECRET).update(token).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch { return null; }
  const sess = sessions.get(token);
  return (sess && Date.now() < sess.exp) ? sess : null;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, sess] of sessions) {
    if (now > sess.exp) sessions.delete(token);
  }
  persistSessions();
}, 60 * 60 * 1000);

function requireAuth(req, res, next) {
  const sess = validateSession(req);
  if (!sess) {
    secLog('UNAUTH', req);
    return res.status(401).json({ error: 'נדרשת התחברות', loginRequired: true });
  }
  req.userEmail = sess.email;
  next();
}

function requireAdmin(req, res, next) {
  const sess = validateSession(req);
  if (!sess || !sess.email || !ADMIN_EMAILS.includes(sess.email)) {
    secLog('ADMIN_DENY', req);
    return res.status(403).json({ error: 'אין הרשאה' });
  }
  next();
}

// ─── /api/register — יצירת חשבון חדש ────────────────────────────────────────
app.post('/api/register', makeRateLimit('login'), express.json({ limit: '2kb' }), (req, res) => {
  const { email, username, password } = req.body || {};

  const emailNorm = String(email || '').trim().toLowerCase();
  const nameNorm  = String(username || '').trim();

  if (!EMAIL_RE.test(emailNorm) || emailNorm.length > 100)
    return res.status(400).json({ error: 'כתובת אימייל לא תקינה' });
  if (!USERNAME_RE.test(nameNorm))
    return res.status(400).json({ error: 'שם משתמש: 2–30 תווים (אותיות, מספרים, רווח)' });
  if (typeof password !== 'string' || password.length < 6 || password.length > 100)
    return res.status(400).json({ error: 'סיסמה: לפחות 6 תווים' });

  const users = loadUsers();
  if (users[emailNorm]) {
    return res.status(409).json({ error: 'כתובת האימייל כבר רשומה — נסה להתחבר' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  users[emailNorm] = {
    email:     emailNorm,
    username:  nameNorm,
    salt,
    passHash:  hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };
  saveUsers(users);

  issueSession(res, emailNorm);
  console.log(`[users] registered: ${emailNorm}`);
  res.json({ ok: true, username: nameNorm, email: emailNorm });
});

// ─── /api/login — התחברות עם חשבון קיים ─────────────────────────────────────
app.post('/api/login', makeRateLimit('login'), (req, res) => {
  const { email, password } = req.body || {};
  const emailNorm = String(email || '').trim().toLowerCase();

  const user = loadUsers()[emailNorm];
  if (!user || typeof password !== 'string') {
    secLog('LOGIN_FAIL', req);
    return res.status(401).json({ error: 'אימייל או סיסמה שגויים' });
  }
  if (!user.passHash) {
    return res.status(401).json({ error: 'החשבון הזה נוצר עם Google — התחבר עם כפתור Google' });
  }

  const attempted = hashPassword(password, user.salt);
  let match = false;
  try {
    match = crypto.timingSafeEqual(Buffer.from(attempted, 'hex'), Buffer.from(user.passHash, 'hex'));
  } catch {}
  if (!match) {
    secLog('LOGIN_FAIL', req);
    return res.status(401).json({ error: 'אימייל או סיסמה שגויים' });
  }

  issueSession(res, emailNorm);
  res.json({ ok: true, username: user.username, email: user.email });
});

// ─── /api/me — פרטי המשתמש המחובר ───────────────────────────────────────────
app.get('/api/me', requireAuth, (req, res) => {
  if (!req.userEmail) return res.json({ email: null, username: null });
  const user = loadUsers()[req.userEmail];
  res.json({ email: req.userEmail, username: user?.username || null });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// ─── /api/config — הגדרות ציבוריות לקליינט ───────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
});

// ─── /api/auth/google — התחברות/הרשמה עם חשבון Google ───────────────────────
app.post('/api/auth/google', makeRateLimit('login'), express.json({ limit: '4kb' }), async (req, res) => {
  const { credential } = req.body || {};
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'התחברות Google לא מוגדרת בשרת' });
  if (!credential || typeof credential !== 'string' || credential.length > 4000) {
    return res.status(400).json({ error: 'בקשה לא תקינה' });
  }

  try {
    // אימות ה-ID token מול גוגל
    const r = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const info = await r.json();
    if (!r.ok || info.aud !== clientId || info.email_verified !== 'true' || !info.email) {
      secLog('GOOGLE_AUTH_FAIL', req);
      return res.status(401).json({ error: 'אימות Google נכשל — נסה שוב' });
    }

    const emailNorm = String(info.email).trim().toLowerCase();
    const users = loadUsers();

    if (!users[emailNorm]) {
      users[emailNorm] = {
        email:     emailNorm,
        username:  (info.name || emailNorm.split('@')[0]).slice(0, 30),
        salt:      null,
        passHash:  null,      // חשבון Google — אין סיסמה מקומית
        provider:  'google',
        createdAt: new Date().toISOString(),
      };
      saveUsers(users);
      console.log(`[users] registered via Google: ${emailNorm}`);
    }

    issueSession(res, emailNorm);
    res.json({ ok: true, username: users[emailNorm].username, email: emailNorm });
  } catch (err) {
    console.error('[google-auth]', err.message);
    res.status(502).json({ error: 'שגיאה באימות מול Google — נסה שוב' });
  }
});

// ─── שחזור סיסמה ─────────────────────────────────────────────────────────────
const resetTokens = new Map(); // token → { email, exp }
const RESET_TTL   = 15 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [t, v] of resetTokens) if (now > v.exp) resetTokens.delete(t);
}, 10 * 60 * 1000);

let _mailer = null;
function getMailer() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  if (!_mailer) {
    const nodemailer = require('nodemailer');
    _mailer = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return _mailer;
}

app.post('/api/forgot', makeRateLimit('login'), express.json({ limit: '1kb' }), async (req, res) => {
  const emailNorm = String(req.body?.email || '').trim().toLowerCase();
  // תמיד עונים אותו דבר — לא חושפים אילו מיילים רשומים
  const genericOk = { ok: true, message: 'אם הכתובת רשומה — נשלח אליה קישור לאיפוס' };

  if (!EMAIL_RE.test(emailNorm)) return res.json(genericOk);
  const user = loadUsers()[emailNorm];
  if (!user) return res.json(genericOk);
  if (!user.passHash) return res.json(genericOk); // חשבון Google — אין מה לאפס

  const mailer = getMailer();
  if (!mailer) {
    console.error('[forgot] SMTP not configured (SMTP_USER/SMTP_PASS)');
    return res.status(500).json({ error: 'שחזור סיסמה עדיין לא מופעל — פנה למנהל' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  resetTokens.set(token, { email: emailNorm, exp: Date.now() + RESET_TTL });

  const base = IS_PROD ? `https://${req.headers.host}` : 'http://localhost:5173';
  const link = `${base}/reset?token=${token}`;

  try {
    await mailer.sendMail({
      from: `"טרמפיט" <${process.env.SMTP_USER}>`,
      to: emailNorm,
      subject: 'איפוס סיסמה — טרמפיט',
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7">
        <p>שלום ${user.username},</p>
        <p>קיבלנו בקשה לאיפוס הסיסמה שלך בטרמפיט. הקישור תקף ל-15 דקות:</p>
        <p><a href="${link}" style="background:#C2410C;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;display:inline-block">איפוס סיסמה</a></p>
        <p style="color:#78716C;font-size:13px">אם לא ביקשת איפוס — התעלם מהמייל הזה.</p>
      </div>`,
    });
    res.json(genericOk);
  } catch (err) {
    console.error('[forgot] send error:', err.message);
    res.status(500).json({ error: 'שליחת המייל נכשלה — נסה שוב מאוחר יותר' });
  }
});

app.post('/api/reset', makeRateLimit('login'), express.json({ limit: '1kb' }), (req, res) => {
  const { token, password } = req.body || {};
  const entry = token && resetTokens.get(String(token));
  if (!entry || Date.now() > entry.exp) {
    return res.status(400).json({ error: 'הקישור פג תוקף או לא תקין — בקש איפוס חדש' });
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 100) {
    return res.status(400).json({ error: 'סיסמה: לפחות 6 תווים' });
  }

  const users = loadUsers();
  const user  = users[entry.email];
  if (!user) return res.status(400).json({ error: 'החשבון לא נמצא' });

  user.salt     = crypto.randomBytes(16).toString('hex');
  user.passHash = hashPassword(password, user.salt);
  saveUsers(users);
  resetTokens.delete(String(token));

  issueSession(res, entry.email);
  console.log(`[users] password reset: ${entry.email}`);
  res.json({ ok: true, username: user.username, email: user.email });
});

// ─── מעקב חיפושים — הדאטהבייס ההתנהגותי לכל משתמש ───────────────────────────
const MAX_SEARCH_LOG = 5000;

function logSearch(req, entry) {
  const searches = store.get('searches', []);
  searches.push({ ...entry, email: req.userEmail || null, ts: new Date().toISOString() });
  if (searches.length > MAX_SEARCH_LOG) searches.splice(0, searches.length - MAX_SEARCH_LOG);
  store.set('searches', searches);
}

// ─── /api/admin/overview — משתמשים + היסטוריית חיפושים (אדמין בלבד) ─────────
app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const users    = loadUsers();
  const searches = store.get('searches', []);

  const byEmail = {};
  for (const s of searches) {
    if (!s.email) continue;
    (byEmail[s.email] = byEmail[s.email] || []).push(s);
  }

  res.json({
    totalUsers:    Object.keys(users).length,
    totalSearches: searches.length,
    users: Object.values(users)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map(u => ({
        email:       u.email,
        username:    u.username,
        createdAt:   u.createdAt,
        searchCount: (byEmail[u.email] || []).length,
        searches:    (byEmail[u.email] || []).slice(-50).reverse(),
      })),
  });
});

// ─── /api/analyze ────────────────────────────────────────────────────────────

function messagesHaveImage(messages) {
  return messages.some(msg =>
    Array.isArray(msg.content) && msg.content.some(b => b.type === 'image')
  );
}

const STAR_LABELS = { 1: '⭐', 2: '⭐⭐', 3: '⭐⭐⭐', 4: '⭐⭐⭐⭐', 5: '⭐⭐⭐⭐⭐' };

const SYSTEM_PROMPT = `אתה עוזר ניווט לטרמפיסטים בישראל. תפקידך לעזור למשתמש למצוא את הדרך הטובה ביותר להגיע ליעדו בטרמפים.
ענה תמיד בעברית, בצורה ממוקדת ומעשית.
כשמשתמש שואל על מסלול — ציין נקודות טרמפ ספציפיות לאורך הדרך, כולל מחלפים וצמתים.
כשנקודות מאומתות זמינות — תן להן עדיפות בהמלצות שלך.`;

// חילוץ קווי אוטובוס מה-notes: "קו 840→תל אביב | קו 885→אשדוד"
function extractBusLines(notes) {
  if (!notes) return [];
  return [...notes.matchAll(/קו\s+(\d+)→([^|]+)/gu)]
    .map(m => ({ line: m[1], to: m[2].trim() }))
    .slice(0, 4);
}

function buildSpotsContext() {
  const spots  = loadSpots();
  const db     = loadTrampitDb();
  const lines  = [];

  // נקודות קהילה (דיווחי משתמשים)
  if (spots.length > 0) {
    lines.push('נקודות קהילה:');
    spots.forEach(s => {
      const stars = STAR_LABELS[Math.round(s.rating)] || '';
      const hours = s.bestHours ? ` · ${s.bestHours}` : '';
      lines.push(`• ${s.name} (${s.city}) · ${s.direction} · ${stars}${hours}`);
    });
  }

  // נקודות מסד הנתונים המאומת — מסודרות לפי מספר קווי אוטובוס
  const dbPoints = db.points
    .filter(p => p.activeBusLinesCount > 0)
    .sort((a, b) => b.activeBusLinesCount - a.activeBusLinesCount)
    .slice(0, 90);

  if (dbPoints.length > 0) {
    lines.push('\nנקודות טרמפ מאומתות (מסד נתונים):');
    dbPoints.forEach(p => {
      const busLines = extractBusLines(p.notes);
      const busStr   = busLines.length > 0
        ? busLines.map(b => `${b.line}→${b.to}`).join(' | ')
        : `${p.activeBusLinesCount} קווים`;
      const road = p.currentRoad > 0 ? ` · כביש ${p.currentRoad}` : '';
      lines.push(`• ${p.name}${road} | ${busStr}`);
    });
  }

  if (lines.length === 0) return '';
  return `\n\nנקודות טרמפ:\n${lines.join('\n')}`;
}

// מביא את כל ה-parts (טקסט + תמונות) מהמסרים בפורמט Gemini
function toGeminiParts(messages) {
  const parts = [];
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'image') {
          parts.push({
            inline_data: {
              mime_type: block.source?.media_type || 'image/jpeg',
              data: (block.source?.data || '').slice(0, 4 * 1024 * 1024), // max ~3MB base64
            },
          });
        } else if (block.type === 'text') {
          parts.push({ text: block.text.slice(0, 8000) });
        }
      }
    } else if (typeof msg.content === 'string') {
      parts.push({ text: msg.content.slice(0, 8000) });
    }
  }
  return parts;
}

app.post('/api/analyze', requireAuth, makeRateLimit('analyze'), async (req, res) => {
  const messages = req.body.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
    return res.status(400).json({ error: 'בקשה לא תקינה' });
  }

  const ALLOWED_ROLES = new Set(['user', 'assistant']);
  const sanitized = messages.filter(msg => typeof msg.role === 'string' && ALLOWED_ROLES.has(msg.role));
  if (sanitized.length === 0) return res.status(400).json({ error: 'בקשה לא תקינה' });

  // ── ולידציה של תמונות: MIME type + magic bytes ──────────────────────────
  const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const IMAGE_MAGIC = { 'image/jpeg': '/9j/', 'image/png': 'iVBOR', 'image/webp': 'UklGR' };
  const MAX_B64 = 7 * 1024 * 1024; // ~5MB binary
  for (const msg of sanitized) {
    if (!Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block.type !== 'image') continue;
      const mime = block.source?.media_type || '';
      const data = block.source?.data || '';
      if (!ALLOWED_IMAGE_MIME.has(mime))
        return res.status(400).json({ error: 'סוג תמונה לא נתמך' });
      if (data.length > MAX_B64)
        return res.status(400).json({ error: 'התמונה גדולה מדי' });
      if (!data.startsWith(IMAGE_MAGIC[mime]))
        return res.status(400).json({ error: 'קובץ תמונה לא תקין' });
    }
  }

  try {
    // ── תמונה → Gemini (תומך ב-vision), טקסט בלבד → Groq (מהיר יותר) ──
    if (messagesHaveImage(sanitized)) {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) return res.status(500).json({ error: 'GEMINI_API_KEY לא מוגדר — הוסף מפתח ב-.env' });

      const parts    = [{ text: SYSTEM_PROMPT + buildSpotsContext() }, ...toGeminiParts(sanitized)];
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { maxOutputTokens: 1500, temperature: 0.3 },
          }),
          signal: AbortSignal.timeout(25000),
        }
      );

      const data = await response.json();
      if (response.status === 429) return res.status(429).json({ error: 'מכסת ה-API מלאה — נסה שוב בעוד דקה' });
      if (!response.ok) {
        console.error('Gemini error:', response.status, data?.error?.message);
        return res.status(502).json({ error: 'שגיאה בשירות ה-AI — נסה שוב' });
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return res.json({ content: [{ type: 'text', text }] });

    } else {
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) return res.status(500).json({ error: 'GROQ_API_KEY לא מוגדר — הוסף מפתח ב-.env' });

      const groqMessages = [
        { role: 'system', content: SYSTEM_PROMPT + buildSpotsContext() },
        ...sanitized.map(msg => {
          if (typeof msg.content === 'string') return { role: msg.role, content: msg.content.slice(0, 8000) };
          if (Array.isArray(msg.content)) {
            const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
            return { role: msg.role, content: text.slice(0, 8000) };
          }
          return { role: msg.role, content: String(msg.content).slice(0, 8000) };
        }),
      ];

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: groqMessages, max_tokens: 1500, temperature: 0.3 }),
        signal: AbortSignal.timeout(20000),
      });

      const data = await response.json();
      if (response.status === 429) return res.status(429).json({ error: 'מכסת ה-API מלאה — נסה שוב בעוד דקה' });
      if (!response.ok) {
        console.error('Groq error:', response.status);
        return res.status(502).json({ error: 'שגיאה בשירות ה-AI — נסה שוב' });
      }

      const text = data.choices?.[0]?.message?.content || '';
      return res.json({ content: [{ type: 'text', text }] });
    }

  } catch (err) {
    console.error('Fetch error:', err.message);
    res.status(500).json({ error: 'שגיאת חיבור לשרת AI' });
  }
});

// ─── /api/analyze-waze-image — ניתוח צילום מסך Waze עם Gemini Vision ──────────
app.post('/api/analyze-waze-image', requireAuth, makeRateLimit('analyze'), async (req, res) => {
  const { imageBase64, mimeType } = req.body || {};

  const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!imageBase64 || !mimeType || !ALLOWED_MIME.includes(mimeType)) {
    return res.status(400).json({ error: 'קובץ לא תקין — שלח תמונה מסוג JPEG/PNG/WebP' });
  }
  // base64 of 8MB image ≈ 11MB string
  if (imageBase64.length > 11 * 1024 * 1024) {
    return res.status(400).json({ error: 'הקובץ גדול מדי (מקסימום 8MB)' });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return res.status(500).json({ error: 'GEMINI_API_KEY לא מוגדר בשרת' });

  const prompt = `You are analyzing a Waze navigation screenshot from Israel.
Extract the following and return ONLY valid JSON, no markdown, no explanation:
{
  "carDest": "name of the driver destination in Hebrew (city or place name, short)",
  "roads": ["list of road numbers or names visible, e.g. כביש 1, כביש 6, רחוב הרצל"],
  "confidence": "high" | "medium" | "low"
}
Rules:
- carDest must be in Hebrew if the destination is in Israel
- If destination is not visible or unclear, set carDest to null
- roads should list major highways/roads visible on the route, not every street
- Return ONLY the JSON object, nothing else`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ]}],
          generationConfig: { maxOutputTokens: 300, temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(20000),
      }
    );

    const data = await response.json();
    if (response.status === 429) return res.status(429).json({ error: 'מכסת API מלאה — נסה שוב בעוד דקה' });
    if (!response.ok) {
      console.error('Gemini vision error:', response.status, data?.error?.message);
      return res.status(502).json({ error: 'שגיאה בניתוח תמונה — נסה שוב' });
    }

    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(422).json({ error: 'לא הצלחנו לזהות יעד בתמונה — נסה תמונה אחרת' });

    const result = JSON.parse(jsonMatch[0]);
    if (!result.carDest) return res.status(422).json({ error: 'לא זוהה יעד בתמונה — ודא שמסך הניווט פתוח' });

    return res.json({ carDest: result.carDest, roads: result.roads || [], confidence: result.confidence || 'medium' });

  } catch (err) {
    if (err.name === 'TimeoutError') return res.status(504).json({ error: 'הניתוח לקח יותר מדי — נסה שוב' });
    console.error('analyze-waze-image error:', err.message);
    return res.status(500).json({ error: 'שגיאת שרת בניתוח תמונה' });
  }
});

// ─── /api/vote — הצבעות קהילה על נקודות טרמפ ────────────────────────────────
function loadVotes() {
  return store.get('votes', {});
}

function saveVotes(v) {
  store.set('votes', v);
}

// GET — מחזיר ספירות להצבעות לפי keys (ללא IPs)
app.get('/api/vote', (req, res) => {
  const keys   = (req.query.keys || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 30);
  const all    = loadVotes();
  const result = {};
  for (const k of keys) {
    if (all[k]) result[k] = { up: all[k].up || 0, down: all[k].down || 0 };
  }
  res.json(result);
});

// POST — הצבעה (up/down), מניעת כפילות לפי IP
app.post('/api/vote', makeRateLimit('confirmSpot'), express.json({ limit: '512b' }), (req, res) => {
  const { key, vote } = req.body || {};
  if (!key || typeof key !== 'string' || key.length > 120) return res.status(400).json({ error: 'מפתח לא תקין' });
  if (vote !== 'up' && vote !== 'down')                   return res.status(400).json({ error: 'הצבעה לא תקינה' });

  const ip  = req.ip || 'unknown';
  const all = loadVotes();
  if (!all[key]) all[key] = { up: 0, down: 0, upV: [], downV: [] };
  const e   = all[key];

  if (e.upV.includes(ip) || e.downV.includes(ip)) {
    return res.status(409).json({ error: 'כבר הצבעת', up: e.up, down: e.down });
  }

  e[vote]++;
  e[`${vote}V`].push(ip);
  saveVotes(all);
  res.json({ ok: true, up: e.up, down: e.down });
});

// ─── /api/spots — נקודות טרמפ קהילתיות ─────────────────────────────────────
function loadSpots() {
  return store.get('spots', []);
}

function saveSpots(spots) {
  store.set('spots', spots);
}

const VALID_SPOT_TEXT  = /^[֐-׿a-zA-Z0-9 \-'.,\/]{2,60}$/;
const SPOT_DIRECTIONS  = new Set(['צפון', 'דרום', 'מזרח', 'מערב', 'צפון-דרום', 'כל הכיוונים']);

app.get('/api/spots', (req, res) => {
  res.json(loadSpots().map(({ reporters, ...s }) => s));
});

app.post('/api/spots', makeRateLimit('spots'), express.json({ limit: '2kb' }), (req, res) => {
  const { name, city, direction, bestHours, rating, coordinates } = req.body || {};

  if (!name || !VALID_SPOT_TEXT.test(String(name)))          return res.status(400).json({ error: 'שם מיקום לא תקין' });
  if (!city || !VALID_SPOT_TEXT.test(String(city)))          return res.status(400).json({ error: 'שם עיר לא תקין' });
  if (!direction || !SPOT_DIRECTIONS.has(String(direction))) return res.status(400).json({ error: 'כיוון לא תקין' });
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) return res.status(400).json({ error: 'ציון לא תקין' });
  if (bestHours && (typeof bestHours !== 'string' || bestHours.length > 60)) return res.status(400).json({ error: 'שעות לא תקינות' });

  const spots    = loadSpots();
  const nameTr   = String(name).trim();
  const cityTr   = String(city).trim();
  const existing = spots.find(s => s.name === nameTr && s.city === cityTr);

  if (existing) {
    existing.rating   = Math.round((existing.rating * existing.reports + ratingNum) / (existing.reports + 1) * 10) / 10;
    existing.reports += 1;
    if (bestHours) existing.bestHours = String(bestHours).trim();
    saveSpots(spots);
    return res.json({ ok: true, updated: true });
  }

  const coordsValid = coordinates &&
    typeof coordinates.lat === 'number' && typeof coordinates.lng === 'number' &&
    coordinates.lat >= 29 && coordinates.lat <= 34 &&
    coordinates.lng >= 34 && coordinates.lng <= 36;

  const spot = {
    id:          crypto.randomBytes(8).toString('hex'),
    name:        nameTr,
    city:        cityTr,
    direction:   String(direction),
    bestHours:   bestHours ? String(bestHours).trim() : '',
    rating:      ratingNum,
    reports:     1,
    pending:     true,
    reporters:   [req.ip || 'unknown'],
    createdAt:   new Date().toISOString(),
    ...(coordsValid && { coordinates: { lat: coordinates.lat, lng: coordinates.lng } }),
  };
  spots.push(spot);
  saveSpots(spots);
  const { reporters: _r, ...spotPublic } = spot;
  res.json({ ok: true, spot: spotPublic });
});

// ─── /api/spots/:id/confirm — אישור קהילתי (3 IPs שונים → מאושר) ─────────────
app.post('/api/spots/:id/confirm', makeRateLimit('confirmSpot'), (req, res) => {
  const ip    = req.ip || 'unknown';
  const spots = loadSpots();
  const spot  = spots.find(s => s.id === req.params.id);
  if (!spot) return res.status(404).json({ error: 'נקודה לא נמצאה' });
  if (!spot.pending) return res.json({ ok: true, alreadyApproved: true, confirmations: (spot.reporters || []).length });

  if (!spot.reporters) spot.reporters = [];
  if (spot.reporters.includes(ip)) return res.status(409).json({ error: 'כבר אישרת נקודה זו' });

  spot.reporters.push(ip);
  const count = spot.reporters.length;
  if (count >= 3) spot.pending = false;
  saveSpots(spots);
  res.json({ ok: true, confirmations: count, approved: !spot.pending });
});

// ─── /api/spots/:id/approve — אישור ידני על ידי אדמין ───────────────────────
app.post('/api/spots/:id/approve', requireAdmin, (req, res) => {
  const spots = loadSpots();
  const spot  = spots.find(s => s.id === req.params.id);
  if (!spot) return res.status(404).json({ error: 'נקודה לא נמצאה' });
  spot.pending = false;
  saveSpots(spots);
  res.json({ ok: true });
});

// ─── DELETE /api/spots/:id — מחיקה על ידי אדמין ─────────────────────────────
app.delete('/api/spots/:id', requireAdmin, (req, res) => {
  const spots = loadSpots();
  const idx   = spots.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'נקודה לא נמצאה' });
  spots.splice(idx, 1);
  saveSpots(spots);
  res.json({ ok: true });
});

// ─── /api/geocode — reverse geocoding דרך השרת ──────────────────────────────
app.get('/api/geocode', requireAuth, makeRateLimit('cities'), async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'חסרים פרמטרים' });

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1&accept-language=he`,
      { headers: { 'User-Agent': 'TrampitApp/1.0 trempit01@gmail.com', 'Accept-Language': 'he' },
        signal: AbortSignal.timeout(8000) }
    );
    const data = await response.json();
    const a = data.address || {};
    console.log('[geocode] raw address fields:', JSON.stringify(a));

    // שם העיר/יישוב
    const cityRaw = a.city || a.town || a.city_district || a.village || a.quarter || a.neighbourhood || a.suburb || null;
    if (!cityRaw) return res.json({ city: null, address: null });

    // התאמה לרשימת הערים הממשלתית
    const cities = citiesCache || [];
    const normalize = s => s.replace(/["״']/g, '').replace(/\s+/g, ' ').trim();
    const normRaw = normalize(cityRaw);
    const cityMatch = cities.find(c => {
      const nc = normalize(c);
      return nc === normRaw || nc.includes(normRaw) || normRaw.includes(nc);
    }) || cityRaw;

    // כתובת מלאה: רחוב + מספר בית + עיר
    const road        = a.road || a.pedestrian || a.footway || a.path || '';
    const houseNumber = a.house_number || '';
    let address = '';
    if (road && houseNumber) address = `${road} ${houseNumber}, ${cityMatch}`;
    else if (road)           address = `${road}, ${cityMatch}`;
    else                     address = cityMatch;

    res.json({ city: cityMatch, address });
  } catch (err) {
    console.error('[geocode]', err.message);
    res.status(500).json({ error: 'שגיאת geocoding' });
  }
});

// ─── /api/points — נקודות טרמפ מאומתות מה-DB ────────────────────────────────
app.get('/api/points', requireAuth, (req, res) => {
  let pts = loadTrampitDb().points
    .filter(p => p.safetyRating !== 'dangerous')
    .filter(p => p.currentRoad > 0 || p.activeBusLinesCount > 0);

  const { bbox } = req.query;
  if (bbox) {
    const parts = bbox.split(',').map(Number);
    if (parts.length === 4 && parts.every(n => isFinite(n))) {
      const [s, w, n, e] = parts; // south, west, north, east
      pts = pts.filter(p =>
        p.coordinates.lat >= s && p.coordinates.lat <= n &&
        p.coordinates.lng >= w && p.coordinates.lng <= e
      );
    }
  }

  res.json(pts.map(p => ({
    id:          p.id,
    name:        p.name,
    coordinates: p.coordinates,
    roadType:    p.roadType,
    direction:   p.direction,
    transitType: p.transitType,
    currentRoad: p.currentRoad,
    activeBusLinesCount: p.activeBusLinesCount,
    servedDestinations:  p.servedDestinations,
    isVerified:          p.activeBusLinesCount > 0,
  })));
});

// ─── /api/decision — מנוע החלטות נסיעה פעילה ────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── /api/route/match — מציאת צמתי טרמפ לאורך מסלול נסיעה ──────────────────
app.post('/api/route/match', requireAuth, makeRateLimit('decision'), express.json({ limit: '50kb' }), (req, res) => {
  const { routePoints } = req.body || {};

  if (!Array.isArray(routePoints) || routePoints.length < 2) {
    return res.status(400).json({ error: 'routePoints חייב להיות מערך עם לפחות 2 נקודות' });
  }
  if (routePoints.length > 500) {
    return res.status(400).json({ error: 'routePoints לא יכול לעלות על 500 נקודות' });
  }
  for (const pt of routePoints) {
    if (typeof pt.lat !== 'number' || typeof pt.lng !== 'number' ||
        pt.lat < 29 || pt.lat > 34 || pt.lng < 34 || pt.lng > 36) {
      return res.status(400).json({ error: 'קואורדינטות לא תקינות — חייבות להיות בתחום ישראל' });
    }
  }

  const MATCH_RADIUS_M = 150;
  const DEG_BUFFER     = MATCH_RADIUS_M / 111320 + 0.001; // ~0.0024 מעלות

  // ── שלב 1: Bounding Box — סינון ראשוני מהיר ─────────────────────────────
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  for (const pt of routePoints) {
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;
    if (pt.lng < minLng) minLng = pt.lng;
    if (pt.lng > maxLng) maxLng = pt.lng;
  }
  minLat -= DEG_BUFFER; maxLat += DEG_BUFFER;
  minLng -= DEG_BUFFER; maxLng += DEG_BUFFER;

  const candidates = loadTrampitDb().points
    .filter(p => p.safetyRating !== 'dangerous')
    .filter(p => p.currentRoad > 0 || p.activeBusLinesCount > 0)
    .filter(p => {
      const { lat, lng } = p.coordinates;
      return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
    });

  // ── שלב 2: מרחק ניצב מינימלי למקטע המסלול ───────────────────────────────
  // ממיר לקרטזי מקומי (מטרים) ומחשב מרחק ניצב לקו A→B
  function distPointToSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
    const R      = 6371000;
    const cosLat = Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
    const toM    = Math.PI / 180 * R;

    const px = (pLng - aLng) * cosLat * toM;
    const py = (pLat - aLat) * toM;
    const bx = (bLng - aLng) * cosLat * toM;
    const by = (bLat - aLat) * toM;

    const segLenSq = bx * bx + by * by;
    if (segLenSq === 0) return Math.sqrt(px * px + py * py);

    const t  = Math.max(0, Math.min(1, (px * bx + py * by) / segLenSq));
    const dx = px - t * bx;
    const dy = py - t * by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const matched = [];

  for (const junction of candidates) {
    const { lat: jLat, lng: jLng } = junction.coordinates;
    let minDist = Infinity;
    let bestSeg = -1;

    for (let i = 0; i < routePoints.length - 1; i++) {
      const dist = distPointToSegment(
        jLat, jLng,
        routePoints[i].lat,     routePoints[i].lng,
        routePoints[i + 1].lat, routePoints[i + 1].lng,
      );
      if (dist < minDist) { minDist = dist; bestSeg = i; }
    }

    if (minDist <= MATCH_RADIUS_M) {
      matched.push({
        id:                  junction.id,
        name:                junction.name,
        coordinates:         junction.coordinates,
        currentRoad:         junction.currentRoad,
        activeBusLinesCount: junction.activeBusLinesCount,
        servedDestinations:  junction.servedDestinations,
        safetyRating:        junction.safetyRating,
        isVerified:          junction.activeBusLinesCount > 0,
        distanceFromRoute:   Math.round(minDist),
        _segIdx:             bestSeg,
      });
    }
  }

  // ── שלב 3: מיון כרונולוגי לפי סדר הנסיעה ────────────────────────────────
  matched.sort((a, b) => a._segIdx - b._segIdx);

  res.json({
    total:             matched.length,
    candidatesScanned: candidates.length,
    junctions:         matched.map(({ _segIdx, ...j }) => j),
  });
});

// ─── /api/route/plan — תכנון יציאה: GPS + יעד הנהג → נקודות טרמפ לאורך המסלול
app.get('/api/route/plan', requireAuth, makeRateLimit('decision'), async (req, res) => {
  const userLat = parseFloat(req.query.userLat);
  const userLng = parseFloat(req.query.userLng);
  const dest    = req.query.dest?.trim();

  if (isNaN(userLat) || isNaN(userLng) || !dest || dest.length < 2) {
    return res.status(400).json({ error: 'חסרים פרמטרים: userLat, userLng, dest' });
  }
  if (userLat < 29 || userLat > 34 || userLng < 34 || userLng > 36) {
    return res.status(400).json({ error: 'מיקומך מחוץ לגבולות ישראל' });
  }

  logSearch(req, { type: 'plan', destination: dest });

  // ── שלב 1: Geocoding — יעד הנהג לקואורדינטות ──────────────────────────────
  let destLat, destLng, destName;
  try {
    const geoRes  = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(dest + ', ישראל')}&format=json&limit=1&countrycodes=il`,
      { headers: { 'User-Agent': 'TrampitApp/1.0 trempit01@gmail.com' }, signal: AbortSignal.timeout(8000) }
    );
    const geoData = await geoRes.json();
    if (!geoData?.length) return res.status(404).json({ error: `לא נמצאה כתובת: "${dest}"` });
    destLat  = parseFloat(geoData[0].lat);
    destLng  = parseFloat(geoData[0].lon);
    destName = geoData[0].display_name?.split(',')[0] || dest;
  } catch {
    return res.status(500).json({ error: 'שגיאה בזיהוי כתובת יעד — נסה שוב' });
  }

  // ── שלב 2: OSRM — מסלול נסיעה אמיתי בכביש ────────────────────────────────
  let routePoints, routeDistKm;
  try {
    const osrmRes  = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${userLng},${userLat};${destLng},${destLat}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(12000) }
    );
    const osrmData = await osrmRes.json();
    if (osrmData.code !== 'Ok' || !osrmData.routes?.length) {
      return res.status(502).json({ error: 'לא נמצא מסלול נסיעה' });
    }
    routeDistKm = Math.round(osrmData.routes[0].distance / 100) / 10;
    routePoints = osrmData.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  } catch {
    return res.status(502).json({ error: 'שגיאה בחישוב מסלול — נסה שוב' });
  }

  // ── שלב 3: מציאת נקודות טרמפ לאורך המסלול (זהה ל-/api/route/match) ────────
  const MATCH_RADIUS_M = 200;
  const DEG_BUFFER     = MATCH_RADIUS_M / 111320 + 0.001;

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const pt of routePoints) {
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;
    if (pt.lng < minLng) minLng = pt.lng;
    if (pt.lng > maxLng) maxLng = pt.lng;
  }
  minLat -= DEG_BUFFER; maxLat += DEG_BUFFER;
  minLng -= DEG_BUFFER; maxLng += DEG_BUFFER;

  const candidates = loadTrampitDb().points
    .filter(p => p.safetyRating !== 'dangerous')
    .filter(p => p.currentRoad > 0 || p.activeBusLinesCount > 0)
    .filter(p => {
      const { lat, lng } = p.coordinates;
      return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
    });

  function planDistSeg(pLat, pLng, aLat, aLng, bLat, bLng) {
    const cosLat = Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
    const toM    = Math.PI / 180 * 6371000;
    const px = (pLng - aLng) * cosLat * toM, py = (pLat - aLat) * toM;
    const bx = (bLng - aLng) * cosLat * toM, by = (bLat - aLat) * toM;
    const sq = bx * bx + by * by;
    if (sq === 0) return Math.sqrt(px * px + py * py);
    const t = Math.max(0, Math.min(1, (px * bx + py * by) / sq));
    return Math.sqrt((px - t * bx) ** 2 + (py - t * by) ** 2);
  }

  const matched = [];
  for (const junction of candidates) {
    const { lat: jLat, lng: jLng } = junction.coordinates;
    let minDist = Infinity, bestSeg = -1;
    for (let i = 0; i < routePoints.length - 1; i++) {
      const d = planDistSeg(jLat, jLng, routePoints[i].lat, routePoints[i].lng, routePoints[i+1].lat, routePoints[i+1].lng);
      if (d < minDist) { minDist = d; bestSeg = i; }
    }
    if (minDist <= MATCH_RADIUS_M) {
      matched.push({
        id:                  junction.id,
        name:                junction.name,
        coordinates:         junction.coordinates,
        currentRoad:         junction.currentRoad,
        activeBusLinesCount: junction.activeBusLinesCount,
        servedDestinations:  (junction.servedDestinations || []).slice(0, 5),
        isVerified:          junction.activeBusLinesCount > 0,
        distanceFromUser:    Math.round(haversine(userLat, userLng, jLat, jLng)),
        _segIdx:             bestSeg,
      });
    }
  }

  matched.sort((a, b) => a._segIdx - b._segIdx);

  // ── אשכולות: נקודות קרובות מדי זו לזו (<800מ') הן בעצם אותה עצירה בפועל —
  // משאירים רק את הטובה מכל אשכול (הכי הרבה קווי אוטובוס) ────────────────────
  const MIN_GAP_M = 800;
  const deduped = [];
  for (const cand of matched) {
    const clusterIdx = deduped.findIndex(d =>
      haversine(d.coordinates.lat, d.coordinates.lng, cand.coordinates.lat, cand.coordinates.lng) < MIN_GAP_M
    );
    if (clusterIdx === -1) deduped.push(cand);
    else if (cand.activeBusLinesCount > deduped[clusterIdx].activeBusLinesCount) deduped[clusterIdx] = cand;
  }

  // רק נקודות שבאמת עוזרות — עדיפות למי שיש להן קווי אוטובוס פעילים
  const withBus     = deduped.filter(p => p.activeBusLinesCount > 0);
  const bestPoints  = (withBus.length > 0 ? withBus : deduped).slice(0, 4);

  res.json({
    destination:  { name: destName, lat: destLat, lng: destLng },
    routeDistKm,
    exitPoints:   bestPoints.map(({ _segIdx, ...j }) => j),
    totalFound:   matched.length,
  });
});

// ─── /api/route/options — מחזיר 3 נתיבי OSRM עם שמות כבישים ────────────────────
app.get('/api/route/options', requireAuth, makeRateLimit('decision'), async (req, res) => {
  const origin  = req.query.origin?.trim();
  const carDest = req.query.carDest?.trim();

  const VALID_PLACE = /^[֐-׿a-zA-Z0-9 \-'."״]+$/;
  if (!origin || !carDest ||
      !VALID_PLACE.test(origin) || !VALID_PLACE.test(carDest) ||
      origin.length > 80 || carDest.length > 80) {
    return res.status(400).json({ error: 'חסרים פרמטרים תקינים' });
  }

  async function geocodePlace(place) {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place + ', ישראל')}&format=json&limit=1&countrycodes=il`,
      { headers: { 'User-Agent': 'TrampitApp/1.0 trempit01@gmail.com' }, signal: AbortSignal.timeout(8000) }
    );
    const d = await r.json();
    if (!d?.length) throw new Error(`לא נמצאה כתובת: "${place}"`);
    return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
  }

  let originGeo, carDestGeo;
  try {
    [originGeo, carDestGeo] = await Promise.all([geocodePlace(origin), geocodePlace(carDest)]);
  } catch (err) {
    return res.status(404).json({ error: err.message });
  }

  function extractRoads(osrmRoute) {
    const roadDist = {}, roadOrder = [];
    for (const leg of osrmRoute.legs) {
      for (const step of (leg.steps || [])) {
        const ref = step.ref?.trim();
        if (!ref) continue;
        if (!roadDist[ref]) { roadDist[ref] = 0; roadOrder.push(ref); }
        roadDist[ref] += step.distance || 0;
      }
    }
    return roadOrder.filter(r => roadDist[r] > 1000).slice(0, 4);
  }

  function roadSig(roads) { return roads.slice().sort().join('|'); }

  // כבישים לתצוגה: סף גבוה יותר (2km), מקסימום 3 לקריאות
  function buildDisplayRoads(osrmRoute) {
    const roadDist = {}, roadOrder = [];
    for (const leg of osrmRoute.legs) {
      for (const step of (leg.steps || [])) {
        const ref = step.ref?.trim();
        if (!ref) continue;
        if (!roadDist[ref]) { roadDist[ref] = 0; roadOrder.push(ref); }
        roadDist[ref] += step.distance || 0;
      }
    }
    return roadOrder.filter(r => roadDist[r] > 2000).slice(0, 3);
  }

  async function fetchVia(viaLng, viaLat) {
    const url = `https://router.project-osrm.org/route/v1/driving/` +
      `${originGeo.lng},${originGeo.lat};${viaLng},${viaLat};${carDestGeo.lng},${carDestGeo.lat}` +
      `?overview=full&geometries=geojson&steps=true`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const d = await r.json();
    return (d.code === 'Ok' && d.routes?.length) ? d.routes[0] : null;
  }

  try {
    const osrmRes = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${originGeo.lng},${originGeo.lat};${carDestGeo.lng},${carDestGeo.lat}?overview=full&geometries=geojson&alternatives=3&steps=true`,
      { signal: AbortSignal.timeout(12000) }
    );
    const osrmData = await osrmRes.json();
    if (osrmData.code !== 'Ok' || !osrmData.routes?.length)
      return res.status(502).json({ error: 'לא נמצא מסלול נסיעה' });

    const collected = [...osrmData.routes];

    // אם OSRM לא מצא 3 חלופות — ננסה דרך נקודות ביניים מוזזות אנכית למסלול
    if (collected.length < 3) {
      const geom = osrmData.routes[0].geometry.coordinates; // [lng,lat]
      const midPt = geom[Math.floor(geom.length / 2)];
      const [oLng, oLat] = [originGeo.lng,  originGeo.lat];
      const [dLng, dLat] = [carDestGeo.lng, carDestGeo.lat];

      // וקטור כיוון + אנך (לפי גאומטרית lat/lng)
      const dx = dLng - oLng, dy = dLat - oLat;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const OFFSET = Math.min(0.22, Math.max(0.12, len * 0.45));
      const pLng = (-dy / len) * OFFSET;
      const pLat = ( dx / len) * OFFSET;

      const candidates = [
        [midPt[0] + pLng, midPt[1] + pLat],
        [midPt[0] - pLng, midPt[1] - pLat],
      ];

      // קבל רק נקודות בתוך תחום ישראל
      const inIsrael = ([lng, lat]) =>
        lat >= 29.4 && lat <= 33.4 && lng >= 34.2 && lng <= 35.9;

      const viaResults = await Promise.allSettled(
        candidates.filter(inIsrael).map(([lng, lat]) => fetchVia(lng, lat))
      );
      for (const r of viaResults) {
        if (r.status === 'fulfilled' && r.value) collected.push(r.value);
      }
    }

    // דדאפ לפי חתימת כבישים ראשיים
    const seen = new Set();
    const unique = [];
    for (const route of collected) {
      const roads = extractRoads(route);
      const sig   = roadSig(roads);
      if (!seen.has(sig)) { seen.add(sig); unique.push({ route, roads }); }
      if (unique.length === 3) break;
    }

    // בנה מסלולים עם תיאורים
    const built = unique.map(({ route, roads: dedupRoads }, idx) => {
      const displayRoads = buildDisplayRoads(route);
      const roads = displayRoads.length > 0 ? displayRoads : dedupRoads.slice(0, 3);

      const durationMin = Math.round(route.duration / 60);
      const hours = Math.floor(durationMin / 60);
      const mins  = durationMin % 60;
      const timeLabel = hours > 0
        ? `${hours}:${String(mins).padStart(2, '0')} שעות`
        : `${mins} דק'`;

      const hasToll     = roads.includes('6') || dedupRoads.includes('6');
      const summaryText = roads.length === 0
        ? 'נתיב ישיר'
        : roads.map(r => `כביש ${r}`).join(' → ');

      return {
        index:       idx,
        distKm:      Math.round(route.distance / 100) / 10,
        timeLabel,
        durationSec: route.duration,
        roads,
        summaryText,
        hasToll,
        note:        '',
      };
    });

    // הערות השוואה: אגרה / ללא אגרה
    const anyToll   = built.some(r => r.hasToll);
    const anyNoToll = built.some(r => !r.hasToll);
    const routes = built.map(r => ({
      ...r,
      note: (anyToll && anyNoToll)
        ? (r.hasToll ? 'כולל כביש 6' : 'ללא אגרה')
        : '',
    }));

    return res.json({ routes });
  } catch {
    return res.status(502).json({ error: 'שגיאה בחישוב מסלול — נסה שוב' });
  }
});

// ─── /api/route/exits — יציאה מהרכב: מוצא + יעד נהג + יעד נוסע → נקודות אמיתיות ──
app.get('/api/route/exits', requireAuth, makeRateLimit('decision'), async (req, res) => {
  const origin      = req.query.origin?.trim();
  const carDest     = req.query.carDest?.trim();
  const destination = req.query.destination?.trim();

  const VALID_PLACE = /^[֐-׿a-zA-Z0-9 \-'."״]+$/;
  if (!origin || !carDest || !destination ||
      !VALID_PLACE.test(origin) || !VALID_PLACE.test(carDest) || !VALID_PLACE.test(destination) ||
      origin.length > 80 || carDest.length > 80 || destination.length > 80) {
    return res.status(400).json({ error: 'חסרים פרמטרים תקינים: origin, carDest, destination' });
  }

  logSearch(req, { type: 'search', origin, destination, carDest });

  // ── Geocoding מקבילי ──────────────────────────────────────────────────────
  async function geocodePlace(place) {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place + ', ישראל')}&format=json&limit=1&countrycodes=il`,
      { headers: { 'User-Agent': 'TrampitApp/1.0 trempit01@gmail.com' }, signal: AbortSignal.timeout(8000) }
    );
    const d = await r.json();
    if (!d?.length) throw new Error(`לא נמצאה כתובת: "${place}"`);
    return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon), name: d[0].display_name?.split(',')[0] || place };
  }

  let originGeo, carDestGeo, destGeo;
  try {
    [originGeo, carDestGeo] = await Promise.all([geocodePlace(origin), geocodePlace(carDest)]);
  } catch (err) {
    return res.status(404).json({ error: err.message });
  }
  for (const geo of [originGeo, carDestGeo]) {
    if (geo.lat < 29 || geo.lat > 34 || geo.lng < 34 || geo.lng > 36)
      return res.status(400).json({ error: 'מיקום מחוץ לגבולות ישראל' });
  }
  // geocoding ליעד הנוסע עם addressdetails — לקרבה + gateway matching מורחב
  let destNames = [destination.trim().toLowerCase().replace(/["״'"]/g, '')];
  try {
    const dr = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(destination + ', ישראל')}&format=json&limit=1&countrycodes=il&addressdetails=1`,
      { headers: { 'User-Agent': 'TrampitApp/1.0 trempit01@gmail.com' }, signal: AbortSignal.timeout(8000) }
    );
    const dd = await dr.json();
    if (dd?.length) {
      const addr = dd[0].address || {};
      destGeo = { lat: parseFloat(dd[0].lat), lng: parseFloat(dd[0].lon) };
      // כל גרסאות השם: שכונה, עיר, מחוז — למצוא gateway גם בערי הנפה
      destNames = [
        destination,
        dd[0].display_name?.split(',')[0],
        addr.neighbourhood, addr.suburb, addr.city_district,
        addr.city, addr.town, addr.village,
        addr.county, addr.region, addr.state_district,
      ].filter(Boolean)
       .map(s => s.trim().toLowerCase().replace(/["״'"]/g, ''))
       .filter(s => s.length > 1);
      destNames = [...new Set(destNames)];
    }
  } catch { destGeo = null; }

  // הוסף מילים בודדות מהיעד (≥3 תווים) לmatch חלקי — "יד רמב"ם" → ["יד","רמבם"]
  const destTokens = destination.trim().toLowerCase().replace(/["״'"]/g, '').split(/\s+/).filter(t => t.length >= 3);
  destNames = [...new Set([...destNames, ...destTokens])];

  // ── OSRM — מסלול הרכב (מוצא → יעד הנהג) ─────────────────────────────────
  const routeIndex = Math.min(parseInt(req.query.routeIndex) || 0, 2);
  let routePoints, routeDistKm;
  try {
    const needAlts = routeIndex > 0;
    const osrmRes = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${originGeo.lng},${originGeo.lat};${carDestGeo.lng},${carDestGeo.lat}?overview=full&geometries=geojson${needAlts ? '&alternatives=3' : ''}`,
      { signal: AbortSignal.timeout(12000) }
    );
    const osrmData = await osrmRes.json();
    if (osrmData.code !== 'Ok' || !osrmData.routes?.length)
      return res.status(502).json({ error: 'לא נמצא מסלול נסיעה' });
    const chosen = osrmData.routes[Math.min(routeIndex, osrmData.routes.length - 1)];
    routeDistKm = Math.round(chosen.distance / 100) / 10;
    routePoints = chosen.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  } catch {
    return res.status(502).json({ error: 'שגיאה בחישוב מסלול — נסה שוב' });
  }

  // ── שלב א': Route Corridor — סינון קשיח 150 מטר ─────────────────────────
  const MATCH_RADIUS_M = 150;
  const DEG_BUFFER = MATCH_RADIUS_M / 111320 + 0.001;

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const pt of routePoints) {
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;
    if (pt.lng < minLng) minLng = pt.lng;
    if (pt.lng > maxLng) maxLng = pt.lng;
  }
  minLat -= DEG_BUFFER; maxLat += DEG_BUFFER;
  minLng -= DEG_BUFFER; maxLng += DEG_BUFFER;

  // מרחק מצטבר לאורך המסלול (במטרים)
  const cumDist = [0];
  for (let i = 1; i < routePoints.length; i++)
    cumDist.push(cumDist[i - 1] + haversine(routePoints[i-1].lat, routePoints[i-1].lng, routePoints[i].lat, routePoints[i].lng));

  function perpDistAndT(pLat, pLng, aLat, aLng, bLat, bLng) {
    const cosLat = Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
    const toM    = Math.PI / 180 * 6371000;
    const px = (pLng - aLng) * cosLat * toM, py = (pLat - aLat) * toM;
    const bx = (bLng - aLng) * cosLat * toM, by = (bLat - aLat) * toM;
    const sq = bx * bx + by * by;
    if (sq === 0) return { dist: Math.sqrt(px * px + py * py), t: 0 };
    const t = Math.max(0, Math.min(1, (px * bx + py * by) / sq));
    return { dist: Math.sqrt((px - t * bx) ** 2 + (py - t * by) ** 2), t };
  }

  const candidates = loadTrampitDb().points
    .filter(p => p.safetyRating !== 'dangerous')
    .filter(p => p.currentRoad > 0 || p.activeBusLinesCount > 0)
    .filter(p => {
      const { lat, lng } = p.coordinates;
      return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
    });

  const routeMatched = [];
  for (const junction of candidates) {
    const { lat: jLat, lng: jLng } = junction.coordinates;
    let minDist = Infinity, bestSeg = -1, bestT = 0;
    for (let i = 0; i < routePoints.length - 1; i++) {
      const { dist, t } = perpDistAndT(jLat, jLng, routePoints[i].lat, routePoints[i].lng, routePoints[i+1].lat, routePoints[i+1].lng);
      if (dist < minDist) { minDist = dist; bestSeg = i; bestT = t; }
    }
    if (minDist <= MATCH_RADIUS_M) {
      const distFromStart = cumDist[bestSeg] + bestT * (cumDist[bestSeg + 1] - cumDist[bestSeg]);
      routeMatched.push({ ...junction, _segIdx: bestSeg, _distFromStart: Math.round(distFromStart) });
    }
  }
  routeMatched.sort((a, b) => a._segIdx - b._segIdx);

  // ── שלב ב': סינון כיוון + ציון משולב + Top 3 ────────────────────────────────
  // matchesGateway — בודק מול כל גרסאות השם של יעד הנוסע (שכונה, עיר, מחוז)
  function matchesGateway(p) {
    const fields = [...(p.gatewayFor || []), ...(p.servedDestinations || [])];
    return fields.some(f => {
      const fn = f.toLowerCase().replace(/["״'"]/g, '');
      return destNames.some(dn => {
        if (dn.length <= 1) return false;
        if (fn.includes(dn) || dn.includes(fn)) return true;
        // word-level match: any word ≥3 chars from destName found in the field
        return dn.split(/\s+/).filter(w => w.length >= 3).some(w => fn.includes(w));
      });
    });
  }

  // נקודת ההתקרבות המקסימלית של מסלול הנהג אל יעד הנוסע
  let closestApproachM = Infinity;
  if (destGeo) {
    for (const pt of routePoints)
      closestApproachM = Math.min(closestApproachM, haversine(pt.lat, pt.lng, destGeo.lat, destGeo.lng));
  }

  // סינון כיוון: שולל צמתים רחוקים יותר מנקודת ההתקרבות + 8 ק"מ
  const DIRECTION_MARGIN_M = 8000;
  const directional = (destGeo && closestApproachM < Infinity)
    ? routeMatched.filter(p =>
        haversine(p.coordinates.lat, p.coordinates.lng, destGeo.lat, destGeo.lng)
          <= closestApproachM + DIRECTION_MARGIN_M
      )
    : routeMatched;

  const pool = directional.length > 0 ? directional : routeMatched;

  // ── שלב א': Pre-sort גיאומטרי → Top 10 מועמדים ──────────────────────────────
  const geoPreSorted = pool
    .map(p => {
      const gw   = matchesGateway(p);
      const dist = destGeo
        ? haversine(p.coordinates.lat, p.coordinates.lng, destGeo.lat, destGeo.lng) / 1000 : 0;
      return { ...p, _pre: (gw ? 2000 : 0) + (p.activeBusLinesCount || 0) * 30 - dist * 5 };
    })
    .sort((a, b) => b._pre - a._pre)
    .slice(0, 10);

  // ── שלב ב': שליפת קווים חיים מ-Hasadna — parallel, timeout 5s ────────────────
  const T_BASE      = 'https://open-bus-stride-api.hasadna.org.il';
  const T_MONTH     = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                        .toISOString().split('T')[0];

  const liveCounts = await Promise.all(geoPreSorted.map(async p => {
    // בדוק transit cache קיים (מהפרונטנד)
    const ck = `${p.name}_`;
    const cached = transitCache.get(ck);
    if (cached && Date.now() - cached.time < ROUTE_CACHE_TTL)
      return cached.routeObjects?.length ?? -1;
    try {
      const raw = await fetch(
        `${T_BASE}/gtfs_routes/list?route_long_name_contains=${encodeURIComponent(p.name)}&date_from=${T_MONTH}&limit=30`,
        { signal: AbortSignal.timeout(5000) }
      ).then(r => r.json()).catch(() => null);
      return Array.isArray(raw) ? raw.length : -1;
    } catch { return -1; }
  }));

  // liveBus: נתון חי אם חזר (≥0), אחרת fallback לDB
  const liveRanked = geoPreSorted.map((p, i) => ({
    ...p,
    _liveBus: liveCounts[i] >= 0 ? liveCounts[i] : (p.activeBusLinesCount || 0),
  }));

  // ── שלב ג': No Blind Drops — מבוסס נתון חי ───────────────────────────────────
  const withBus    = liveRanked.filter(p => p._liveBus > 0);
  const scoringPool = withBus.length > 0 ? withBus : liveRanked;

  // ── שלב ד': הנקודה הקרובה ביותר ליעד — בונוס 5000 ────────────────────────────
  let closestToDest = null;
  if (destGeo) {
    let minD = Infinity;
    for (const p of scoringPool) {
      const d = haversine(p.coordinates.lat, p.coordinates.lng, destGeo.lat, destGeo.lng);
      if (d < minD) { minD = d; closestToDest = p; }
    }
  }

  // ── ציון סופי: Nearest*5000 + Gateway*2000 + liveBus*150 - distKm*5 ──────────
  function scorePoint(p) {
    const isNearest = closestToDest && p === closestToDest;
    const isGateway = matchesGateway(p);
    const distKm    = destGeo
      ? haversine(p.coordinates.lat, p.coordinates.lng, destGeo.lat, destGeo.lng) / 1000 : 0;
    return (isNearest ? 5000 : 0) + (isGateway ? 2000 : 0) + (p._liveBus * 150) - (distKm * 5);
  }

  const top3 = scoringPool
    .map(p => ({ ...p, _score: scorePoint(p) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 3);

  const exitPoints = top3.map(p => ({
    location:            p.name,
    exitDistance:        `${Math.round(p._distFromStart / 100) / 10} ק"מ`,
    coordinates:         p.coordinates,
    currentRoad:         p.currentRoad,
    activeBusLinesCount: p._liveBus,
    servedDestinations:  (p.servedDestinations || []).slice(0, 4),
    isGatewayMatch:      matchesGateway(p) || p === closestToDest,
  }));

  res.json({
    origin:       { name: originGeo.name },
    carDest:      { name: carDestGeo.name },
    routeDistKm,
    exitPoints,
    totalOnRoute: routeMatched.length,
  });
});

app.post('/api/decision', requireAuth, makeRateLimit('decision'), express.json({ limit: '1kb' }), (req, res) => {
  const { userLat, userLng, destination, driverNextRoad } = req.body || {};

  if (typeof userLat !== 'number' || typeof userLng !== 'number' || !destination) {
    return res.status(400).json({ error: 'חסרים פרמטרים: userLat, userLng, destination' });
  }

  const dest     = String(destination).trim().slice(0, 60);
  const nextRoad = Number(driverNextRoad) || 0;

  const allPoints = loadTrampitDb().points
    .filter(p => p.safetyRating !== 'dangerous')
    .filter(p => p.currentRoad > 0 || p.activeBusLinesCount > 0);

  // נקודות רלוונטיות ליעד — עם fallback לנקודות הקרובות ביותר אם אין התאמה
  let relevant = allPoints
    .filter(p => Array.isArray(p.servedDestinations) &&
      p.servedDestinations.some(d => destinationMatchesCity(d, dest)))
    .sort((a, b) =>
      haversine(userLat, userLng, a.coordinates.lat, a.coordinates.lng) -
      haversine(userLat, userLng, b.coordinates.lat, b.coordinates.lng)
    );

  // fallback: אם אין נקודות ליעד — קח את 5 הקרובות ביותר
  if (relevant.length === 0) {
    relevant = allPoints
      .map(p => ({ ...p, _dist: haversine(userLat, userLng, p.coordinates.lat, p.coordinates.lng) }))
      .filter(p => p._dist < 5000)
      .sort((a, b) => a._dist - b._dist)
      .slice(0, 5);
  }

  const result = evaluateRouteDecision(
    { lat: userLat, lng: userLng },
    { userTargetDestination: dest, driverNextRoad: nextRoad },
    relevant.map(p => p.id)
  );

  res.json(result);
});

// ─── /api/transit — נתוני תחבורה ציבורית מהסדנה (GTFS + SIRI) ───────────────
// cache רק עבור גילוי קווים (30 דק') — שעות תמיד נטענות רענן
const ROUTE_CACHE_TTL  = 30 * 60 * 1000;
const TRANSIT_MAX_KEYS = 200;
const transitCache = new Map();

function pruneTransitCache() {
  const now = Date.now();
  for (const [key, entry] of transitCache) {
    if (now - entry.time > ROUTE_CACHE_TTL) transitCache.delete(key);
  }
  if (transitCache.size > TRANSIT_MAX_KEYS) {
    const sorted = [...transitCache.entries()].sort((a, b) => a[1].time - b[1].time);
    sorted.slice(0, transitCache.size - TRANSIT_MAX_KEYS).forEach(([k]) => transitCache.delete(k));
  }
}

// עיצוב טווח datetime לפי ה-API
// gtfs_rides.start_time/end_time מעוגנים תמיד לתאריך קבוע 2023-01-01 (שעון חורף, בלי שעון קיץ) —
// הם מייצגים אך ורק את שעת-היום בישראל, לא תאריך אמיתי. לכן צריך "לתרגם" את הזמן הנוכחי
// לשעת-היום בישראל ואז להטמיע אותה על התאריך העוגן, בהיסט הקבוע UTC+2 (חורף, ללא DST).
// מחשב את שני הקצוות יחד (לא בנפרד) כדי לשמר נכון מעבר חצות אמיתי בין from ל-to.
function apiTimeRange(fromDate, toDate) {
  const hmsFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }); // 'YYYY-MM-DD'
  const baseDayStr = dayFmt.format(fromDate);
  const pad = n => String(n).padStart(2, '0');

  function encode(d) {
    const parts = hmsFmt.formatToParts(d);
    const get = t => parts.find(p => p.type === t).value;
    let h = parseInt(get('hour'), 10) - 2; // היסט קבוע לשעון חורף
    const dayOffsetDays = Math.round(
      (Date.parse(dayFmt.format(d) + 'T00:00:00Z') - Date.parse(baseDayStr + 'T00:00:00Z')) / 86400000
    );
    let anchorDay = 1 + dayOffsetDays; // baseDayStr → 2023-01-01 (יום 1)
    if (h < 0)  { h += 24; anchorDay -= 1; }
    if (h >= 24) { h -= 24; anchorDay += 1; }
    const dateStr = new Date(Date.UTC(2023, 0, anchorDay)).toISOString().split('T')[0];
    return `${dateStr}T${pad(h)}:${get('minute')}:${get('second')}+00:00`;
  }

  return { from: encode(fromDate), to: encode(toDate) };
}

// המרת UTC ל-HH:MM ישראל
function toIsraelTime(isoStr) {
  return new Date(isoStr).toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

app.get('/api/transit', requireAuth, makeRateLimit('transit'), async (req, res) => {
  const { stop, destination } = req.query;

  const VALID_PLACE = /^[֐-׿a-zA-Z0-9 \-'.\/]{1,100}$/;
  if (!stop || typeof stop !== 'string' || !VALID_PLACE.test(stop)) {
    secLog('INVALID_INPUT', req, `stop="${stop?.slice(0,30)}"`);
    return res.status(400).json({ error: 'שם תחנה לא תקין' });
  }
  if (destination && (typeof destination !== 'string' || !VALID_PLACE.test(destination))) {
    secLog('INVALID_INPUT', req, `destination="${destination?.slice(0,30)}"`);
    return res.status(400).json({ error: 'שם יעד לא תקין' });
  }

  // קואורדינטות אופציונליות לנקודות יציאה (צמתים/מחלפים)
  const coordLat = parseFloat(req.query.lat);
  const coordLng = parseFloat(req.query.lng);
  const hasCoords = !isNaN(coordLat) && !isNaN(coordLng) &&
                    coordLat >= 29 && coordLat <= 34 && coordLng >= 34 && coordLng <= 36;

  const cacheKey = `${stop}_${destination || ''}`;
  const cached = transitCache.get(cacheKey);

  const BASE = 'https://open-bus-stride-api.hasadna.org.il';
  const stopTrim = stop.trim();
  // נקה קידומות של צמתים/מחלפים — "מסעף צרעה" → "צרעה"
  const stopNorm = stopTrim.replace(/^(מסעף|מחלף|צומת|תחנת|מרכז)\s+/u, '').trim();
  const destTrim = destination ? destination.trim() : null;

  try {
    // ── א. גילוי קווים ותחנות (cached 30 דק') ───────────────────────────────
    let stopsData, routeObjects; // routeObjects שומר גם id פנימי לשליפת שעות

    if (cached && Date.now() - cached.time < ROUTE_CACHE_TTL) {
      ({ stopsData, routeObjects } = cached);
    } else {
      pruneTransitCache();
      const opts        = { signal: AbortSignal.timeout(12000) };
      const now         = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
                            .toISOString().split('T')[0];

      // פונקציה: נסה לחפש תחנות לפי שם עיר, עם fallback לגיאוקוד לפי קואורדינטות
      async function resolveSearchName() {
        // נסה תחילה עם השם המנוקה
        for (const name of [stopNorm, stopTrim]) {
          const raw = await fetch(
            `${BASE}/gtfs_stops/list?city=${encodeURIComponent(name)}&date_from=${firstOfMonth}&limit=10`, opts
          ).then(r => r.json()).catch(() => []);
          if (Array.isArray(raw) && raw.length > 0) return { cityName: name, stopsRaw: raw };
        }
        // fallback — גיאוקוד לפי קואורדינטות
        if (hasCoords) {
          const geo = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coordLat}&lon=${coordLng}&format=json&zoom=10&accept-language=he`,
            { headers: { 'User-Agent': 'TrampitApp/1.0 trempit01@gmail.com' }, signal: AbortSignal.timeout(7000) }
          ).then(r => r.json()).catch(() => null);
          const geocity = geo?.address?.city || geo?.address?.town || geo?.address?.village || geo?.address?.county;
          if (geocity) {
            const raw = await fetch(
              `${BASE}/gtfs_stops/list?city=${encodeURIComponent(geocity)}&date_from=${firstOfMonth}&limit=10`, opts
            ).then(r => r.json()).catch(() => []);
            return { cityName: geocity, stopsRaw: Array.isArray(raw) ? raw : [] };
          }
        }
        return { cityName: stopNorm, stopsRaw: [] };
      }

      const { cityName, stopsRaw: stopsRawResolved } = await resolveSearchName();
      const effectiveName = cityName; // השם שבו בפועל מצאנו תוצאות

      // תל אביב edge-case
      let stopsRaw = stopsRawResolved;
      if (stopsRaw.length === 0 && (stopTrim === 'תל אביב' || effectiveName === 'תל אביב')) {
        stopsRaw = await fetch(
          `${BASE}/gtfs_stops/list?city=%D7%AA%D7%9C+%D7%90%D7%91%D7%99%D7%91+%D7%99%D7%A4%D7%95&date_from=${firstOfMonth}&limit=10`, opts
        ).then(r => r.json()).catch(() => []);
      }
      stopsData = (Array.isArray(stopsRaw) ? stopsRaw : []);

      // קווים בין-עירוניים
      routeObjects = [];
      const isCityEndpoint = (longName, city) => {
        const esc = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`-${esc}(?:<->|-\\d)`, 'u').test(longName);
      };
      // כל השמות לחיפוש (מנוקה + מקורי + גיאוקוד)
      const searchNames = [...new Set([effectiveName, stopNorm, stopTrim])];

      if (destTrim) {
        const destEnc     = encodeURIComponent(destTrim);
        const destRoutesRaw = await fetch(
          `${BASE}/gtfs_routes/list?route_long_name_contains=${destEnc}&date_from=${firstOfMonth}&limit=300`, opts
        ).then(r => r.json()).catch(() => []);
        const destRoutes  = Array.isArray(destRoutesRaw) ? destRoutesRaw : [];

        const intercity = destRoutes.filter(r => {
          const name = r.route_long_name || '';
          return searchNames.some(sn =>
            isCityEndpoint(name, sn) ||
            (sn === 'תל אביב' && isCityEndpoint(name, 'תל אביב יפו'))
          ) && (
            isCityEndpoint(name, destTrim) ||
            (destTrim === 'תל אביב' && isCityEndpoint(name, 'תל אביב יפו'))
          );
        });

        const candidates = intercity.length > 0 ? intercity : destRoutes;

        const byMkt = new Map();
        for (const r of candidates) {
          const key   = r.route_mkt || `${r.route_short_name}_${r.agency_name}`;
          const arrow = (r.route_long_name || '').indexOf('<->');
          const startPart = arrow >= 0 ? r.route_long_name.slice(arrow + 3) : '';
          const correctDir = searchNames.some(sn =>
            startPart.includes(sn) ||
            (sn === 'תל אביב' && startPart.includes('תל אביב יפו'))
          );
          if (!byMkt.has(key) || correctDir) byMkt.set(key, r);
        }
        routeObjects = [...byMkt.values()].slice(0, 4);
      } else {
        // ללא יעד — הבא קווים בין-עירוניים לכל שמות החיפוש
        const allRoutes = [];
        for (const sn of searchNames) {
          const raw = await fetch(
            `${BASE}/gtfs_routes/list?route_long_name_contains=${encodeURIComponent(sn)}&date_from=${firstOfMonth}&limit=300`, opts
          ).then(r => r.json()).catch(() => []);
          if (Array.isArray(raw)) allRoutes.push(...raw);
        }
        // הסר כפילויות
        const seenMkt = new Set();
        const stopRoutes = allRoutes.filter(r => {
          const k = r.route_mkt || `${r.route_short_name}_${r.agency_name}`;
          if (seenMkt.has(k)) return false;
          seenMkt.add(k); return true;
        });

        const intercity = stopRoutes.filter(r =>
          searchNames.some(sn =>
            isCityEndpoint(r.route_long_name || '', sn) ||
            (sn === 'תל אביב' && isCityEndpoint(r.route_long_name || '', 'תל אביב יפו'))
          )
        );

        const byMkt = new Map();
        for (const r of (intercity.length > 0 ? intercity : stopRoutes)) {
          const key = r.route_mkt || `${r.route_short_name}_${r.agency_name}`;
          if (!byMkt.has(key)) byMkt.set(key, r);
        }
        routeObjects = [...byMkt.values()].slice(0, 8);
      }

      transitCache.set(cacheKey, { stopsData, routeObjects, time: Date.now() });
    }

    // ── ב. שעות יציאה — תמיד רענן, פרלל לכל הקווים ───────────────────────
    // הערה: שליחת start_time_from וגם start_time_to יחד ל-API גורמת לשאילתה
    // איטית מאוד בצד השרת שלהם (נצפו 8-10+ שניות, לפעמים timeout) — לכן שולחים
    // רק start_time_from + מיון עולה, ומסננים בצד שלנו כל מה שמעבר לחלון הזמן.
    const nowMs   = Date.now();
    const { from: timeFrom, to: timeTo } = apiTimeRange(new Date(nowMs), new Date(nowMs + 5 * 3600 * 1000)); // +5 שעות
    const depOpts  = { signal: AbortSignal.timeout(10000) };

    const departuresByIdx = await Promise.all(
      routeObjects.map(async r => {
        try {
          // Tel Aviv edge case: API long names use "תל אביב יפו", not "תל אביב"
          const destForFilter = destTrim === 'תל אביב' ? 'תל אביב יפו' : destTrim;
          // Direction filter: destTrim<-> matches routes where destination is the TERMINAL (before <->)
          const dirFilter = destForFilter
            ? `&gtfs_route__route_long_name_contains=${encodeURIComponent(destForFilter + '<->')}`
            : '';
          // route_mkt is stable across daily GTFS batches (unlike gtfs_route_id which changes every day)
          // Fallback to short_name+agency when route_mkt is missing
          const routeFilter = r.route_mkt
            ? `gtfs_route__route_mkt=${encodeURIComponent(r.route_mkt)}`
            : r.route_short_name
              ? `gtfs_route__route_short_name=${encodeURIComponent(r.route_short_name)}&gtfs_route__agency_name=${encodeURIComponent(r.agency_name || '')}`
              : null;
          if (!routeFilter) return [];
          const url = `${BASE}/gtfs_rides/list?${routeFilter}` +
            dirFilter +
            `&start_time_from=${encodeURIComponent(timeFrom)}` +
            `&order_by=${encodeURIComponent('start_time asc')}&limit=20`;
          const data = await fetch(url, depOpts).then(res => res.json()).catch(() => []);
          return (Array.isArray(data) ? data : [])
            .filter(ride => ride.start_time && ride.start_time <= timeTo)
            .slice(0, 8)
            .map(ride => toIsraelTime(ride.start_time))
            .filter(Boolean);
        } catch { return []; }
      })
    );

    // ── ג. בנה תגובה ──────────────────────────────────────────────────────────
    function cityMatch(part, city) {
      if (part.includes(city)) return true;
      return city.split(' ').filter(w => w.length > 1).every(w => part.includes(w));
    }

    const routes = routeObjects.map((r, i) => {
      const name         = r.route_long_name || '';
      const arrow        = name.indexOf('<->');
      const terminalPart = (arrow >= 0 ? name.slice(0, arrow) : name).trim();
      const startPart    = (arrow >= 0 ? name.slice(arrow + 3) : '')
        .replace(/-\d+[\w֐-׿#]*$/, '').trim();

      const startIsOrigin = cityMatch(startPart, stopTrim);
      const termIsOrigin  = cityMatch(terminalPart, stopTrim);
      const [finalFrom, finalTo] =
        startIsOrigin || (!termIsOrigin && cityMatch(terminalPart, destTrim || ''))
          ? [startPart, terminalPart]
          : [terminalPart, startPart];

      return {
        line:       r.route_short_name || '?',
        from:       finalFrom || stopTrim,
        to:         finalTo   || (destTrim || ''),
        company:    r.agency_name || '',
        type:       r.route_type === '2' ? 'רכבת' : 'אוטובוס',
        departures: departuresByIdx[i] || [],
      };
    });

    // ייחודי תחנות לפי קוד
    const seenCodes = new Set();
    const stops = stopsData
      .filter(s => { if (!s.code || seenCodes.has(s.code)) return false; seenCodes.add(s.code); return true; })
      .slice(0, 6)
      .map(s => ({ name: s.name, city: s.city, code: s.code, lat: s.lat, lon: s.lon }));

    res.json({
      stops,
      routes,
      source:     'נתוני תחבורה ציבורית — ממשל פתוח ישראל + עמותת הסדנה',
      serverTime: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[transit]', err.message);
    res.status(500).json({ error: 'שגיאה בטעינת נתוני תחבורה' });
  }
});

// ─── /api/cities — רשימת ישובים מ-data.gov.il (ממשלתי) ──────────────────────
let citiesCache = null;
let cacheTime   = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000;

app.get('/api/cities', requireAuth, makeRateLimit('cities'), async (req, res) => {
  try {
    if (citiesCache && Date.now() - cacheTime < CACHE_TTL) {
      return res.json(citiesCache);
    }
    const response = await fetch(
      'https://data.gov.il/api/3/action/datastore_search?resource_id=5c78e9fa-c2e2-4771-93ff-7f400a12f7ba&limit=5000'
    );
    const data = await response.json();
    const cities = data.result.records
      .map(r => r['שם_ישוב']?.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'he'));
    citiesCache = cities;
    cacheTime = Date.now();
    res.json(cities);
  } catch (err) {
    console.error('[cities]', err.message);
    res.status(500).json([]);
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// Sentry error handler — חייב להיות אחרי כל ה-routes ולפני ה-app.listen
Sentry.setupExpressErrorHandler(app);

const PORT = process.env.PORT || 3000;
store.init().then(() => {
  loadPersistedSessions();
  app.listen(PORT, () => console.log(`Trampit server running on port ${PORT}`));
});

// ─── Graceful shutdown + crash handlers ──────────────────────────────────────
let _exiting = false;
function gracefulExit(code) {
  if (_exiting) return;
  _exiting = true;
  persistSessions();
  Promise.race([
    store.flush(),
    new Promise(r => setTimeout(r, 3000)),
  ]).finally(() => process.exit(code));
}

// שגיאה לא-מטופלת — שולח ל-Sentry, שומר sessions ויוצא
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.message, err.stack);
  Sentry.captureException(err);
  gracefulExit(1);
});

// Promise rejection לא-מטופל — שולח ל-Sentry, מדפיס בלבד
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
  Sentry.captureException(reason);
});

// סיום מסודר (Render שולח SIGTERM לפני restart)
process.on('SIGTERM', () => { console.log('[SIGTERM] shutting down'); gracefulExit(0); });
process.on('SIGINT',  () => { console.log('[SIGINT] shutting down');  gracefulExit(0); });
