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
const app     = express();

app.set('trust proxy', 1);

// ─── Health check — ללא auth, לזיהוי cold start על Render ───────────────────
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

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
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:', 'https://*.tile.openstreetmap.org', 'https://unpkg.com'],
      connectSrc: ["'self'"],
    },
  },
}));

// body parser
app.use('/api/analyze', express.json({ limit: '2mb' }));
app.use('/api/login',   express.json({ limit: '1kb' }));
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
  analyze: { maxRequests: 10, windowMs: 60 * 1000 },
  transit: { maxRequests: 30, windowMs: 60 * 1000 },
  cities:  { maxRequests: 20, windowMs: 60 * 1000 },
  login:   { maxRequests: 5,  windowMs: 60 * 1000 },
  spots:    { maxRequests: 3,  windowMs: 5 * 60 * 1000 },
  decision: { maxRequests: 20, windowMs: 60 * 1000 },
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

// ─── Session auth ─────────────────────────────────────────────────────────────
const crypto        = require('crypto');
const COOKIE_SECRET = process.env.COOKIE_SECRET || crypto.randomBytes(32).toString('hex');
const APP_PASSWORD  = process.env.APP_PASSWORD  || null;
const COOKIE_NAME   = 'trampit_sid';
const SESSION_TTL   = 24 * 60 * 60 * 1000;
const SESSIONS_FILE = path.join(__dirname, 'data', 'sessions.json');

const sessions = new Map();

// טעינת sessions שמורים מקובץ בהפעלה
(function loadPersistedSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
      const now  = Date.now();
      let loaded = 0;
      for (const [token, exp] of Object.entries(data)) {
        if (exp > now) { sessions.set(token, exp); loaded++; }
      }
      if (loaded > 0) console.log(`[sessions] loaded ${loaded} active sessions`);
    }
  } catch { /* קובץ פגום — מתחיל מחדש */ }
})();

// שמירה לקובץ (debounced — 500ms אחרי השינוי האחרון)
let _saveTimer = null;
function persistSessions() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(sessions)), 'utf8');
    } catch (e) { console.error('[sessions] save error:', e.message); }
  }, 500);
}

// שמירה סינכרונית לפני יציאה
function flushSessionsSync() {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(sessions)), 'utf8');
  } catch {}
}

function issueSession(res) {
  const token = crypto.randomBytes(24).toString('hex');
  const sig   = crypto.createHmac('sha256', COOKIE_SECRET).update(token).digest('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  persistSessions();
  res.cookie(COOKIE_NAME, `${token}.${sig}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD,
    maxAge: SESSION_TTL,
  });
}

function validateSession(req) {
  if (!APP_PASSWORD) return true;
  const raw = req.headers.cookie?.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))?.[1];
  if (!raw) return false;
  const dotIdx = raw.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const token = raw.slice(0, dotIdx);
  const sig   = raw.slice(dotIdx + 1);
  const expected = crypto.createHmac('sha256', COOKIE_SECRET).update(token).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return false;
  } catch { return false; }
  const exp = sessions.get(token);
  return exp && Date.now() < exp;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, exp] of sessions) {
    if (now > exp) sessions.delete(token);
  }
  persistSessions();
}, 60 * 60 * 1000);

function requireAuth(req, res, next) {
  if (!validateSession(req)) {
    secLog('UNAUTH', req);
    return res.status(401).json({ error: 'נדרשת התחברות', loginRequired: true });
  }
  next();
}

app.post('/api/login', makeRateLimit('login'), (req, res) => {
  const { password } = req.body || {};
  if (!APP_PASSWORD) return res.json({ ok: true });
  if (!password || password !== APP_PASSWORD) {
    secLog('LOGIN_FAIL', req);
    return res.status(401).json({ error: 'סיסמה שגויה' });
  }
  issueSession(res);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
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

// ─── /api/spots — נקודות טרמפ קהילתיות ─────────────────────────────────────
const SPOTS_FILE = path.join(__dirname, 'spots.json');
let spotsCache = null;

function loadSpots() {
  if (spotsCache) return spotsCache;
  try { spotsCache = JSON.parse(fs.readFileSync(SPOTS_FILE, 'utf8')); }
  catch { spotsCache = []; }
  return spotsCache;
}

function saveSpots(spots) {
  spotsCache = spots;
  fs.writeFileSync(SPOTS_FILE, JSON.stringify(spots, null, 2), 'utf8');
}

const VALID_SPOT_TEXT  = /^[֐-׿a-zA-Z0-9 \-'.,\/]{2,60}$/;
const SPOT_DIRECTIONS  = new Set(['צפון', 'דרום', 'מזרח', 'מערב', 'צפון-דרום', 'כל הכיוונים']);

app.get('/api/spots', (req, res) => {
  res.json(loadSpots());
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
    createdAt:   new Date().toISOString(),
    ...(coordsValid && { coordinates: { lat: coordinates.lat, lng: coordinates.lng } }),
  };
  spots.push(spot);
  saveSpots(spots);
  res.json({ ok: true, spot });
});

// ─── /api/geocode — reverse geocoding דרך השרת ──────────────────────────────
app.get('/api/geocode', requireAuth, makeRateLimit('cities'), async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'חסרים פרמטרים' });

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1&accept-language=he`,
      { headers: { 'User-Agent': 'TrampitApp/1.0 kingkalla26@gmail.com', 'Accept-Language': 'he' },
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

// ─── /api/nearestRoad — זיהוי כביש מ-GPS ────────────────────────────────────
app.get('/api/nearestRoad', requireAuth, makeRateLimit('decision'), (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'חסרים lat/lng' });

  const SEARCH_RADIUS = 800; // מטר — בתוך הרדיוס הזה מחפשים נקודה קרובה
  const points = loadTrampitDb().points
    .filter(p => p.currentRoad > 0)
    .map(p => ({ ...p, _dist: haversine(lat, lng, p.coordinates.lat, p.coordinates.lng) }))
    .filter(p => p._dist < SEARCH_RADIUS)
    .sort((a, b) => a._dist - b._dist);

  if (points.length === 0) return res.json({ road: 0, pointName: null, distance: null });

  const nearest = points[0];
  res.json({
    road:      nearest.currentRoad,
    pointName: nearest.name,
    distance:  Math.round(nearest._dist),
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

  // מחזיר גם את הנקודות הקרובות לתצוגה בUI
  const nearbyPoints = allPoints
    .map(p => ({ ...p, _dist: haversine(userLat, userLng, p.coordinates.lat, p.coordinates.lng) }))
    .filter(p => p._dist < 3000)
    .sort((a, b) => a._dist - b._dist)
    .slice(0, 4)
    .map(p => ({
      id:          p.id,
      name:        p.name,
      distance:    Math.round(p._dist),
      currentRoad: p.currentRoad,
      activeBusLinesCount: p.activeBusLinesCount,
      safetyRating: p.safetyRating,
    }));

  res.json({ ...result, nearbyPoints });
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

// עיצוב datetime לפי ה-API
function toAPITime(d) {
  return d.toISOString().split('.')[0] + '+00:00';
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

  const cacheKey = `${stop}_${destination || ''}`;
  const cached = transitCache.get(cacheKey);

  const BASE = 'https://open-bus-stride-api.hasadna.org.il';
  const stopTrim = stop.trim();
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

      // תחנות בעיר המוצא
      const cityEnc = encodeURIComponent(stopTrim);
      let stopsRaw  = await fetch(
        `${BASE}/gtfs_stops/list?city=${cityEnc}&date_from=${firstOfMonth}&limit=10`, opts
      ).then(r => r.json()).catch(() => []);
      if (Array.isArray(stopsRaw) && stopsRaw.length === 0 && stopTrim === 'תל אביב') {
        stopsRaw = await fetch(
          `${BASE}/gtfs_stops/list?city=%D7%AA%D7%9C+%D7%90%D7%91%D7%99%D7%91+%D7%99%D7%A4%D7%95&date_from=${firstOfMonth}&limit=10`, opts
        ).then(r => r.json()).catch(() => []);
      }
      stopsData = (Array.isArray(stopsRaw) ? stopsRaw : []);

      // קווים בין-עירוניים
      routeObjects = [];
      if (destTrim) {
        const destEnc     = encodeURIComponent(destTrim);
        const destRoutesRaw = await fetch(
          `${BASE}/gtfs_routes/list?route_long_name_contains=${destEnc}&date_from=${firstOfMonth}&limit=300`, opts
        ).then(r => r.json()).catch(() => []);
        const destRoutes  = Array.isArray(destRoutesRaw) ? destRoutesRaw : [];

        function isCityEndpoint(longName, city) {
          const esc = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`-${esc}(?:<->|-\\d)`, 'u').test(longName);
        }

        const intercity = destRoutes.filter(r => {
          const name = r.route_long_name || '';
          const hasOrigin =
            isCityEndpoint(name, stopTrim) ||
            (stopTrim === 'תל אביב' && isCityEndpoint(name, 'תל אביב יפו'));
          return hasOrigin && isCityEndpoint(name, destTrim);
        });

        const candidates = intercity.length > 0 ? intercity : destRoutes;

        const byMkt = new Map();
        for (const r of candidates) {
          const key   = r.route_mkt || `${r.route_short_name}_${r.agency_name}`;
          const arrow = (r.route_long_name || '').indexOf('<->');
          const startPart = arrow >= 0 ? r.route_long_name.slice(arrow + 3) : '';
          const correctDir =
            startPart.includes(stopTrim) ||
            (stopTrim === 'תל אביב' && startPart.includes('תל אביב יפו'));
          if (!byMkt.has(key) || correctDir) byMkt.set(key, r);
        }
        routeObjects = [...byMkt.values()].slice(0, 4); // max 4 קווים (לשעות)
      }

      transitCache.set(cacheKey, { stopsData, routeObjects, time: Date.now() });
    }

    // ── ב. שעות יציאה — תמיד רענן, פרלל לכל הקווים ───────────────────────
    const nowMs   = Date.now();
    const timeFrom = toAPITime(new Date(nowMs));
    const timeTo   = toAPITime(new Date(nowMs + 5 * 3600 * 1000)); // +5 שעות
    const depOpts  = { signal: AbortSignal.timeout(8000) };

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
            `&start_time_to=${encodeURIComponent(timeTo)}` +
            `&order_by=start_time asc&limit=8`;
          const data = await fetch(url, depOpts).then(res => res.json()).catch(() => []);
          return (Array.isArray(data) ? data : [])
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
app.listen(PORT, () => console.log(`Trampit server running on port ${PORT}`));

// ─── Graceful shutdown + crash handlers ──────────────────────────────────────
function gracefulExit(code) {
  flushSessionsSync();
  process.exit(code);
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
