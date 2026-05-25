require('dotenv').config();
const express = require('express');
const helmet  = require('helmet');
const path    = require('path');
const app     = express();

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
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Rate limiting פר IP ────────────────────────────────────────────────────
const rateLimitMap = new Map(); // ip → { count, windowStart }

const RATE_LIMITS = {
  analyze: { maxRequests: 10, windowMs: 60 * 1000 },  // 10/דקה — יקר (Groq)
  transit: { maxRequests: 30, windowMs: 60 * 1000 },  // 30/דקה — API חיצוני
  cities:  { maxRequests: 5,  windowMs: 60 * 1000 },  // 5/דקה — יש cache, אין סיבה לקרוא יותר
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
      return res.status(429).json({ error: `יותר מדי בקשות — נסה שוב בעוד ${retryAfter} שניות` });
    }

    entry.count++;
    next();
  };
}

// ─── /api/analyze ────────────────────────────────────────────────────────────
app.post('/api/analyze', makeRateLimit('analyze'), async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY לא מוגדר — הוסף מפתח ב-.env' });
  }

  const messages = req.body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'בקשה לא תקינה' });
  }

  try {
    const ALLOWED_ROLES = new Set(['user', 'assistant']);
    const groqMessages = messages
      .filter(msg => ALLOWED_ROLES.has(msg.role)) // חוסם role: "system" מהלקוח
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
    console.log('Groq status:', response.status);

    if (response.status === 429) {
      return res.status(429).json({ error: 'מכסת ה-API מלאה — נסה שוב בעוד דקה' });
    }

    if (!response.ok) {
      console.error('Groq error:', JSON.stringify(data));
      return res.status(response.status).json({ error: data.error?.message || 'שגיאה בשירות ה-AI' });
    }

    const text = data.choices?.[0]?.message?.content || '';
    return res.json({ content: [{ type: 'text', text }] });

  } catch (err) {
    console.error('Fetch error:', err.message);
    res.status(500).json({ error: 'שגיאת חיבור לשרת AI' });
  }
});

// ─── /api/transit — נתוני תחבורה ציבורית מ-data.gov.il + הסדנה ───────────────
const TRANSIT_TTL      = 30 * 60 * 1000; // 30 דקות
const TRANSIT_MAX_KEYS = 200;            // מקסימום entries בו-זמנית
let transitCache = {};

// מנקה entries שפג תוקפם, ואם עדיין גדול מדי — מוחק הישנים ביותר
function pruneTransitCache() {
  const now = Date.now();
  for (const key of Object.keys(transitCache)) {
    if (now - transitCache[key].time > TRANSIT_TTL) delete transitCache[key];
  }
  const keys = Object.keys(transitCache);
  if (keys.length > TRANSIT_MAX_KEYS) {
    keys.sort((a, b) => transitCache[a].time - transitCache[b].time)
        .slice(0, keys.length - TRANSIT_MAX_KEYS)
        .forEach(k => delete transitCache[k]);
  }
}

app.get('/api/transit', makeRateLimit('transit'), async (req, res) => {
  const { stop, destination } = req.query;

  if (!stop || typeof stop !== 'string') {
    return res.status(400).json({ error: 'חסר שם תחנה' });
  }
  if (stop.length > 100 || (destination && destination.length > 100)) {
    return res.status(400).json({ error: 'שם תחנה ארוך מדי' });
  }

  const cacheKey = `${stop}_${destination || ''}`;
  if (transitCache[cacheKey] && Date.now() - transitCache[cacheKey].time < TRANSIT_TTL) {
    return res.json(transitCache[cacheKey].data);
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

    transitCache[cacheKey] = { data: result, time: Date.now() };
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

app.get('/api/cities', makeRateLimit('cities'), async (req, res) => {
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
