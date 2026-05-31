import { createContext, useContext, useEffect, useState } from 'react';
import SplashScreen from './SplashScreen.jsx';

// ── Config ─────────────────────────────────────────────────────────────────
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const ISRAEL_BBOX  = '29.4,34.2,33.4,36.0'; // south,west,north,east
const CACHE_KEY    = 'trampit_osm_junctions_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 שעות

// ── Overpass QL ────────────────────────────────────────────────────────────
// שלב 1: כל צמתי כביש מהיר בישראל (.junctions)
// שלב 2: כבישים ראשיים שעוברים דרכם (לחלץ מספרי כביש)
// out body qt — פלט כולל lat/lon, תגים, ומערך nodes לכל way
const OVERPASS_QUERY = `
[out:json][timeout:60];
(
  node["highway"="motorway_junction"](${ISRAEL_BBOX});
)->.junctions;
(
  way(bn.junctions)["highway"~"^(motorway|trunk|primary|secondary)$"]["ref"];
  .junctions;
);
out body qt;
`.trim();

// ── localStorage cache ─────────────────────────────────────────────────────
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) { localStorage.removeItem(CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}

function writeCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); }
  catch { /* storage full — silent fail */ }
}

// ── Data parsing ───────────────────────────────────────────────────────────
// הופך תגובת Overpass → מערך JunctionCard-ready objects
function parseElements(elements) {
  // מפריד nodes (צמתים) מ-ways (כבישים)
  const nodeMap = {};   // id → node element
  const wayList = [];

  for (const el of elements) {
    if (el.type === 'node') nodeMap[el.id] = el;
    else if (el.type === 'way') wayList.push(el);
  }

  // בונה מיפוי: junctionId → { roads: Set<number>, destinations: Set<string> }
  const junctionData = {};

  for (const way of wayList) {
    if (!way.nodes || !way.tags?.ref) continue;

    // ref יכול להיות "1;4" לכביש עם כמה מספרים
    const roadNums = way.tags.ref
      .split(';')
      .map(r => parseInt(r.trim()))
      .filter(n => !isNaN(n) && n > 0);

    // יעדים מתגי destination בכביש (לא תמיד קיים בנתוני OSM ישראל)
    const destTags = [
      way.tags['destination'],
      way.tags['destination:he'],
      way.tags['destination:en'],
    ];
    const destinations = destTags
      .filter(Boolean)
      .flatMap(d => d.split(';'))
      .map(d => d.trim())
      .filter(Boolean);

    for (const nodeId of way.nodes) {
      // דלג על nodes שאינם צמתים שלנו
      if (!nodeMap[nodeId]) continue;

      if (!junctionData[nodeId]) {
        junctionData[nodeId] = { roads: new Set(), destinations: new Set() };
      }
      roadNums.forEach(r => junctionData[nodeId].roads.add(r));
      destinations.forEach(d => junctionData[nodeId].destinations.add(d));
    }
  }

  // בונה מערך JunctionCard props
  const results = [];

  for (const [idStr, node] of Object.entries(nodeMap)) {
    if (node.tags?.highway !== 'motorway_junction') continue;

    const id       = Number(idStr);
    const data     = junctionData[id] ?? { roads: new Set(), destinations: new Set() };
    const connectedRoads = [...data.roads].sort((a, b) => a - b);

    // צמת ללא מספרי כביש → לא שימושי, מדלג
    if (connectedRoads.length === 0) continue;

    // שם בעדיפות: שם עברי → שם כללי → "צומת [ref]"
    const name =
      node.tags['name:he'] ||
      node.tags['name']    ||
      (node.tags['ref'] ? `צומת ${node.tags['ref']}` : null) ||
      `OSM ${id}`;

    results.push({
      id:            String(id),
      osmId:         id,
      name,
      road:          connectedRoads[0],
      connectedRoads,
      direction:     'south',            // OSM לא מקודד כיוון טרמפ
      destination:   [...data.destinations].slice(0, 5),
      isSafe:        true,               // OSM אין דירוג בטיחות — ברירת מחדל אופטימית
      busLines:      0,                  // OSM דורש שאילתה נפרדת לעצירות אוטובוס
      coordinates:   { lat: node.lat, lng: node.lon },
    });
  }

  return results;
}

// ── Context ────────────────────────────────────────────────────────────────
const JunctionContext = createContext(null);

export function JunctionProvider({ children }) {
  const [junctions, setJunctions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFading,  setIsFading]  = useState(false);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      // ── שלב 1: בדוק cache ─────────────────────────────────
      const cached = readCache();
      if (cached) {
        if (!cancelled) { setJunctions(cached); setIsLoading(false); }
        return;
      }

      // ── שלב 2: שאילתת Overpass ────────────────────────────
      try {
        const res = await fetch(OVERPASS_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    `data=${encodeURIComponent(OVERPASS_QUERY)}`,
          signal:  controller.signal,
        });

        if (!res.ok) throw new Error(`Overpass החזיר ${res.status}`);

        const json   = await res.json();
        const parsed = parseElements(json.elements ?? []);

        if (!cancelled) {
          setJunctions(parsed);
          writeCache(parsed);
        }
      } catch (err) {
        if (!cancelled && err.name !== 'AbortError') {
          setError(`שגיאה בטעינת נתוני OSM: ${err.message}`);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; controller.abort(); };
  }, []);

  // fade-out של ה-SplashScreen ברגע שהטעינה מסתיימת
  useEffect(() => {
    if (!isLoading) {
      setIsFading(true);
    }
  }, [isLoading]);

  return (
    <JunctionContext.Provider value={{ junctions, isLoading, error }}>
      {isLoading && <SplashScreen fading={isFading} />}
      {children}
    </JunctionContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useJunctions() {
  const ctx = useContext(JunctionContext);
  if (!ctx) throw new Error('useJunctions חייב להיות בתוך <JunctionProvider>');
  return ctx;
}
