/**
 * Trampit persistence layer.
 *
 * בעיה: הדיסק של Render הוא אפמרלי — קבצים שנכתבים בזמן ריצה (דיווחי נקודות,
 * הצבעות, sessions) נמחקים בכל deploy/restart.
 *
 * פתרון: כשמוגדר DATABASE_URL (Postgres — Supabase/Neon/Render) — כל המפתחות
 * נשמרים בטבלת key/value אחת (jsonb) ושורדים deploys. כשאין — fallback לקבצים
 * המקוריים, כך שפיתוח מקומי והאתר החי ממשיכים לעבוד ללא שינוי עד שה-DB מוגדר.
 *
 * בעלייה ראשונה מול DB ריק — הנתונים הקיימים בקבצים מוזרעים אליו אוטומטית.
 */

const fs   = require('fs');
const path = require('path');

const FILE_PATHS = {
  spots:    path.join(__dirname, '..', 'spots.json'),
  votes:    path.join(__dirname, 'votes.json'),
  sessions: path.join(__dirname, 'sessions.json'),
  users:    path.join(__dirname, 'users.json'),
};
const FILE_DEFAULTS = { spots: [], votes: {}, sessions: {}, users: {} };

const cache   = new Map();          // key → value (source of truth בזמן ריצה)
let   pool    = null;               // pg.Pool כשיש DATABASE_URL
const timers  = new Map();          // key → debounce timer
const SAVE_DEBOUNCE_MS = 500;

function readFileKey(key) {
  try { return JSON.parse(fs.readFileSync(FILE_PATHS[key], 'utf8')); }
  catch { return FILE_DEFAULTS[key]; }
}

function writeFileKey(key, value) {
  try { fs.writeFileSync(FILE_PATHS[key], JSON.stringify(value), 'utf8'); }
  catch (e) { console.error(`[store] file write error (${key}):`, e.message); }
}

function initFromFiles(reason) {
  pool = null;
  for (const key of Object.keys(FILE_PATHS)) cache.set(key, readFileKey(key));
  console.log(`[store] file persistence active — ${reason} (data will NOT survive redeploys on Render)`);
}

async function init() {
  const url = process.env.DATABASE_URL;
  if (!url) return initFromFiles('DATABASE_URL not set');

  try {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: url,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
      max: 3,
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS trampit_kv (
        key        text PRIMARY KEY,
        value      jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await pool.query('SELECT key, value FROM trampit_kv');
    const inDb = new Set();
    for (const row of rows) {
      cache.set(row.key, row.value);
      inDb.add(row.key);
    }

    // הזרעה חד-פעמית: מפתחות שקיימים בקבצים אך לא ב-DB
    for (const key of Object.keys(FILE_PATHS)) {
      if (inDb.has(key)) continue;
      const fromFile = readFileKey(key);
      cache.set(key, fromFile);
      const isEmpty = Array.isArray(fromFile) ? fromFile.length === 0 : Object.keys(fromFile).length === 0;
      if (!isEmpty) {
        await upsert(key, fromFile);
        console.log(`[store] seeded '${key}' into Postgres from file`);
      }
    }

    console.log(`[store] Postgres persistence active (${rows.length} keys loaded)`);
  } catch (err) {
    console.error('[store] Postgres init failed:', err.message);
    initFromFiles('DB connection failed');
  }
}

async function upsert(key, value) {
  await pool.query(
    `INSERT INTO trampit_kv (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

function get(key, fallback) {
  return cache.has(key) ? cache.get(key) : fallback;
}

function set(key, value) {
  cache.set(key, value);
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    if (pool) {
      upsert(key, value).catch(e => console.error(`[store] pg save error (${key}):`, e.message));
    } else {
      writeFileKey(key, value);
    }
  }, SAVE_DEBOUNCE_MS));
}

// שמירה מיידית של כל המפתחות הממתינים — לקריאה לפני יציאה
async function flush() {
  const pending = [...timers.keys()];
  for (const key of pending) clearTimeout(timers.get(key));
  timers.clear();
  for (const key of pending) {
    const value = cache.get(key);
    if (pool) {
      try { await upsert(key, value); } catch (e) { console.error(`[store] flush error (${key}):`, e.message); }
    } else {
      writeFileKey(key, value);
    }
  }
}

module.exports = { init, get, set, flush };
