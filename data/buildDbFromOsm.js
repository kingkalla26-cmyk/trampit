/**
 * Trampit DB Builder v3
 * מושך highway=motorway_junction מ-Overpass, סופר עצירות אוטובוס בסביבה,
 * ממזג עם נתוני v2 (בטיחות + יעדים ידניים) → trampitPointsDb.v3.json
 *
 * הרצה:  node data/buildDbFromOsm.js
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const OVERPASS_URL = 'https://overpass.kumi.systems/api/interpreter';
const ISRAEL_BBOX  = '29.4,34.2,33.4,36.0'; // south,west,north,east
const OUTPUT_FILE  = path.join(__dirname, 'trampitPointsDb.v3.json');
const V2_FILE      = path.join(__dirname, 'trampitPointsDb.v2.json');
const BUS_RADIUS_M  = 350; // רדיוס לספירת עצירות אוטובוס
const SNAP_RADIUS_M = 100; // רדיוס להצמדת הנקודה לתחנה הפיזית הקרובה ביותר

// ── שאילתת Overpass ────────────────────────────────────────────────────────
// שלב 1: כל motorway_junction בישראל
// שלב 2: כבישים ראשיים שחוצים אותם (לחלץ מספרי ref)
// שלב 3: עצירות אוטובוס בטווח 350m מכל צומת
const QUERY = `[out:json][timeout:120];
node["highway"="motorway_junction"](${ISRAEL_BBOX})->.junctions;
(
  way(bn.junctions)["highway"~"^(motorway|trunk|primary|secondary)$"]["ref"];
  node(around.junctions:${BUS_RADIUS_M})["highway"="bus_stop"];
  .junctions;
);
out body qt;`;

// ── HTTP POST ──────────────────────────────────────────────────────────────
function overpassPost(query) {
  return new Promise((resolve, reject) => {
    const body    = `data=${encodeURIComponent(query)}`;
    const urlObj  = new URL(OVERPASS_URL);
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent':     'Trampit-DB-Builder/3.0 (educational hitchhike app)',
        'Accept':         'application/json',
      },
    };

    const req = https.request(options, res => {
      let buf = '';
      res.on('data', chunk => { buf += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Overpass HTTP ${res.statusCode}: ${buf.slice(0, 300)}`));
        } else {
          try { resolve(JSON.parse(buf)); }
          catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(130_000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Haversine ──────────────────────────────────────────────────────────────
function distM(lat1, lon1, lat2, lon2) {
  const R  = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a  = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── ID slug ────────────────────────────────────────────────────────────────
function toSlug(name, road) {
  const clean = name
    .replace(/^צומת\s*/u, '')
    .replace(/^מחלף\s*/u, '')
    .replace(/\s+/g, '_')
    .replace(/[^א-ת\w]/g, '');
  return `osm_${clean}_${road}`.toLowerCase();
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('📡 שולח שאילתה ל-Overpass API (עשוי לקחת עד 60 שניות)...');

  const json = await overpassPost(QUERY);
  const total = json.elements.length;
  console.log(`✅ התקבלו ${total} אלמנטים`);

  // ── מיון אלמנטים ──────────────────────────────────────────────────────
  const junctionNodes = {};  // osmId → node element
  const roadWays      = [];
  const busStopNodes  = [];

  for (const el of json.elements) {
    if (el.type === 'node') {
      if (el.tags?.highway === 'motorway_junction') junctionNodes[el.id] = el;
      else if (el.tags?.highway === 'bus_stop')     busStopNodes.push(el);
    } else if (el.type === 'way') {
      roadWays.push(el);
    }
  }

  console.log(`🔀 צמתים: ${Object.keys(junctionNodes).length} | כבישים: ${roadWays.length} | עצירות: ${busStopNodes.length}`);

  // ── בניית מיפוי צומת → כבישים + יעדים ────────────────────────────────
  const jData = {}; // osmId → { roads, roadTypes, destinations, roadToDestMap }

  for (const way of roadWays) {
    if (!way.nodes || !way.tags?.ref) continue;

    const roadNums = way.tags.ref
      .split(';')
      .map(r => parseInt(r.trim()))
      .filter(n => !isNaN(n) && n > 0);

    const hwType = way.tags.highway || '';

    const dests = [way.tags['destination'], way.tags['destination:he']]
      .filter(Boolean)
      .flatMap(d => d.split(';'))
      .map(s => s.trim())
      .filter(Boolean);

    for (const nid of way.nodes) {
      if (!junctionNodes[nid]) continue;

      if (!jData[nid]) {
        jData[nid] = {
          roads:        new Set(),
          roadTypes:    new Set(),
          destinations: new Set(),
          roadToDests:  {},
        };
      }

      roadNums.forEach(r => {
        jData[nid].roads.add(r);
        if (dests.length > 0) {
          if (!jData[nid].roadToDests[r]) jData[nid].roadToDests[r] = new Set();
          dests.forEach(d => jData[nid].roadToDests[r].add(d));
        }
      });

      jData[nid].roadTypes.add(hwType);
      dests.forEach(d => jData[nid].destinations.add(d));
    }
  }

  // ── טעינת v2 לצורך מיזוג ──────────────────────────────────────────────
  const v2 = JSON.parse(fs.readFileSync(V2_FILE, 'utf8'));
  console.log(`📂 נטען trampitPointsDb.v2.json — ${v2.points.length} נקודות לדריסה`);

  // ── בניית נקודות חדשות ─────────────────────────────────────────────────
  const points   = [];
  const seenIds  = new Set();
  let   merged   = 0;

  for (const [idStr, node] of Object.entries(junctionNodes)) {
    const osmId = Number(idStr);
    const data  = jData[osmId];
    if (!data || data.roads.size === 0) continue;

    const name = node.tags['name:he'] || node.tags['name'] ||
      (node.tags['ref'] ? `צומת ${node.tags['ref']}` : `OSM ${osmId}`);

    const connectedRoads = [...data.roads].sort((a, b) => a - b);
    const mainRoad       = connectedRoads[0];
    const isHighway      = [...data.roadTypes].some(t => t === 'motorway' || t === 'trunk');
    const roadType       = isHighway ? 'interchange' : 'urban_junction';

    // ספירת עצירות אוטובוס בטווח
    const nearbyStops  = busStopNodes.filter(bs =>
      distM(node.lat, node.lon, bs.lat, bs.lon) <= BUS_RADIUS_M
    );
    const busCount = nearbyStops.length;

    // בטיחות: safe אם יש עצירות (=יש תשתית המתנה), unknown אחרת
    const osmSafety = busCount > 0 ? 'safe' : 'unknown';

    // הצמדה לתחנת האוטובוס הפיזית הקרובה ביותר — נקודת ההמתנה בפועל
    // היא לרוב לצד הכביש ליד התחנה, לא גיאומטריית הצומת עצמה
    let pointLat = node.lat, pointLng = node.lon;
    if (nearbyStops.length > 0) {
      let nearest = nearbyStops[0];
      let nearestD = distM(node.lat, node.lon, nearest.lat, nearest.lon);
      for (const bs of nearbyStops) {
        const d = distM(node.lat, node.lon, bs.lat, bs.lon);
        if (d < nearestD) { nearest = bs; nearestD = d; }
      }
      if (nearestD <= SNAP_RADIUS_M) {
        pointLat = nearest.lat;
        pointLng = nearest.lon;
      }
    }

    // מיזוג עם v2 — לפי קרבה (≤ 150m) או שם דומה
    const v2match = v2.points.find(p => {
      const d = distM(node.lat, node.lon, p.coordinates.lat, p.coordinates.lng);
      if (d < 150) return true;
      const n1 = name.replace(/^(צומת|מחלף)\s*/u, '');
      const n2 = p.name.replace(/^(צומת|מחלף)\s*/u, '');
      return n1 && n2 && (n1.includes(n2) || n2.includes(n1));
    });

    const pointId = v2match ? v2match.id : toSlug(name, mainRoad);

    if (seenIds.has(pointId)) continue;
    seenIds.add(pointId);
    if (v2match) merged++;

    // roadToDestinations: ממיר Set → Array
    const roadToDestinations = {};
    for (const [r, dSet] of Object.entries(data.roadToDests)) {
      const arr = [...dSet];
      if (arr.length > 0) roadToDestinations[r] = arr;
    }

    const servedDestinations = v2match?.servedDestinations
      ?? [...data.destinations].slice(0, 6);

    points.push({
      id:           pointId,
      name,
      osmId,
      stopId:       v2match?.stopId ?? 0,
      coordinates:  v2match?.coordinates ?? { lat: pointLat, lng: pointLng },
      currentRoad:  mainRoad,
      roadType,
      direction:    v2match?.direction ?? null,
      physicalConnections: connectedRoads,
      safetyRating: v2match?.safetyRating ?? osmSafety,
      transitType:  isHighway ? 'intercity' : 'urban',
      activeBusLinesCount: v2match?.activeBusLinesCount ?? busCount,
      gatewayFor:          v2match?.gatewayFor          ?? servedDestinations,
      servedDestinations,
      roadToDestinations:
        Object.keys(roadToDestinations).length > 0
          ? roadToDestinations
          : (v2match?.roadToDestinations ?? {}),
    });
  }

  // מיון: צפון → דרום
  points.sort((a, b) => b.coordinates.lat - a.coordinates.lat);

  // ── שמירה ─────────────────────────────────────────────────────────────
  const db = {
    systemVersion:  '3.0.0',
    generatedAt:    new Date().toISOString(),
    source:         'OpenStreetMap via Overpass API + manual v2 merge',
    totalPoints:    points.length,
    v2MergedCount:  merged,
    newOsmCount:    points.length - merged,
    points,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(db, null, 2), 'utf8');

  console.log('\n══════════════════════════════════════');
  console.log(`🎉 נשמר: trampitPointsDb.v3.json`);
  console.log(`   סה"כ נקודות : ${points.length}`);
  console.log(`   ממוזגו מ-v2 : ${merged}`);
  console.log(`   חדשות מ-OSM : ${points.length - merged}`);
  console.log(`   בטוחות      : ${points.filter(p => p.safetyRating === 'safe').length}`);
  console.log(`   לא ידוע     : ${points.filter(p => p.safetyRating === 'unknown').length}`);
  console.log('══════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ שגיאה:', err.message);
  process.exit(1);
});
