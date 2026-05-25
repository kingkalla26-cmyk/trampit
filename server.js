require('dotenv').config();
const express = require('express');
const helmet  = require('helmet');
const path    = require('path');
const app     = express();

app.set('trust proxy', 1);

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
app.use(express.static(path.join(__dirname, 'public')));

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
  cities:  { maxRequests: 5,  windowMs: 60 * 1000 },
  login:   { maxRequests: 5,  windowMs: 60 * 1000 },
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

const sessions = new Map();

function issueSession(res) {
  const token = crypto.randomBytes(24).toString('hex');
  const sig   = crypto.createHmac('sha256', COOKIE_SECRET).update(token).digest('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
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
app.post('/api/analyze', requireAuth, makeRateLimit('analyze'), async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY לא מוגדר — הוסף מפתח ב-.env' });
  }

  const messages = req.body.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
    return res.status(400).json({ error: 'בקשה לא תקינה' });
  }

  try {
    const ALLOWED_ROLES = new Set(['user', 'assistant']);
    const groqMessages = messages
      .filter(msg => typeof msg.role === 'string' && ALLOWED_ROLES.has(msg.role))
      .map(msg => {
        if (typeof msg.content === 'string') {
          return { role: msg.role, content: msg.content.slice(0, 8000) };
        }
        if (Array.isArray(msg.content)) {
          const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
          return { role: msg.role, content: text.slice(0, 8000) };
        }
        return { role: msg.role, content: String(msg.content).slice(0, 8000) };
      });

    if (groqMessages.length === 0) {
      return res.status(400).json({ error: 'בקשה לא תקינה' });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        max_tokens: 1500,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(20000),
    });

    const data = await response.json();

    if (response.status === 429) {
      return res.status(429).json({ error: 'מכסת ה-API מלאה — נסה שוב בעוד דקה' });
    }

    if (!response.ok) {
      // לוג פנימי בלבד — לא חושפים פרטי Groq ללקוח
      console.error('Groq error status:', response.status);
      return res.status(502).json({ error: 'שגיאה בשירות ה-AI — נסה שוב' });
    }

    const text = data.choices?.[0]?.message?.content || '';
    return res.json({ content: [{ type: 'text', text }] });

  } catch (err) {
    console.error('Fetch error:', err.message);
    res.status(500).json({ error: 'שגיאת חיבור לשרת AI' });
  }
});

// ─── /api/transit — נתוני תחבורה ציבורית מ-data.gov.il + הסדנה ───────────────
const TRANSIT_TTL      = 30 * 60 * 1000;
const TRANSIT_MAX_KEYS = 200;
const transitCache = new Map(); // Map מונע prototype pollution (לא כמו object רגיל)

function pruneTransitCache() {
  const now = Date.now();
  for (const [key, entry] of transitCache) {
    if (now - entry.time > TRANSIT_TTL) transitCache.delete(key);
  }
  if (transitCache.size > TRANSIT_MAX_KEYS) {
    const sorted = [...transitCache.entries()].sort((a, b) => a[1].time - b[1].time);
    sorted.slice(0, transitCache.size - TRANSIT_MAX_KEYS).forEach(([k]) => transitCache.delete(k));
  }
}

app.get('/api/transit', requireAuth, makeRateLimit('transit'), async (req, res) => {
  const { stop, destination } = req.query;

  // תווים מותרים: עברית, לטינית, ספרות, רווח, מקף, גרש, נקודה, לוכסן
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
  if (cached && Date.now() - cached.time < TRANSIT_TTL) {
    return res.json(cached.data);
  }
  pruneTransitCache();

  try {
    const stopName = encodeURIComponent(stop.trim());

    const stopsRes = await fetch(
      `https://open-bus-stride-api.hasadna.org.il/gtfs_stops/list?name=${stopName}&limit=8`,
      { signal: AbortSignal.timeout(8000) }
    );
    const stops = await stopsRes.json();

    let routes = [];
    if (destination) {
      const destName = encodeURIComponent(destination.trim());
      const routesRes = await fetch(
        `https://open-bus-stride-api.hasadna.org.il/gtfs_routes/list?route_long_name=${destName}&limit=20`,
        { signal: AbortSignal.timeout(8000) }
      );
      const routesData = await routesRes.json();
      const seen = new Set();
      routes = (Array.isArray(routesData) ? routesData : [])
        .filter(r => {
          const key = r.route_short_name;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 8)
        .map(r => ({
          line: r.route_short_name,
          from: r.route_long_name?.split('<->')[1]?.split('-')[0]?.trim() || '',
          to:   r.route_long_name?.split('<->')[0]?.trim() || r.route_long_name,
          company: r.agency_name,
          type: r.route_type === '2' ? 'רכבת' : 'אוטובוס',
        }));
    }

    const result = {
      stops: (Array.isArray(stops) ? stops : []).map(s => ({
        name: s.name, city: s.city, code: s.code, lat: s.lat, lon: s.lon,
      })),
      routes,
      source: 'נתוני תחבורה ציבורית — ממשל פתוח ישראל + עמותת הסדנה',
    };

    transitCache.set(cacheKey, { data: result, time: Date.now() });
    res.json(result);

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
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trampit server running on port ${PORT}`));
