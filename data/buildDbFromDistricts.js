/**
 * Trampit DB Builder v4
 * קורא 7 קבצי מחוז (4272+ נקודות עם קווי אוטובוס אמיתיים),
 * ממיר לפורמט v3, ממזג עם trampitPointsDb.v3.json → trampitPointsDb.v4.json
 *
 * הרצה:  node data/buildDbFromDistricts.js
 */

const fs   = require('fs');
const path = require('path');

const DISTRICTS_DIR = path.join('C:\\Users\\Admin\\Desktop\\נקודות לטרמפ');
const V3_FILE       = path.join(__dirname, 'trampitPointsDb.v3.json');
const OUTPUT_FILE   = path.join(__dirname, 'trampitPointsDb.v4.json');

const DISTRICT_FILES = [
  'tremp-מחוז הדרום.json',
  'tremp-מחוז המרכז.json',
  'tremp-מחוז הצפון.json',
  'tremp-מחוז חיפה.json',
  'tremp-מחוז יהודה ושומרון.json',
  'tremp-מחוז ירושלים.json',
  'tremp-מחוז תל אביב.json',
];

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

// ── חילוץ מספר כביש מ-notes ────────────────────────────────────────────────
function extractRoad(notes) {
  if (!notes) return 0;
  const m = notes.match(/כביש\s+(\d+)/u);
  return m ? parseInt(m[1]) : 0;
}

// ── קביעת roadType ──────────────────────────────────────────────────────────
function getRoadType(name, roadNum) {
  if (/מחלף/u.test(name)) return 'interchange';
  if (roadNum > 0 && roadNum < 800) return 'interchange';
  return 'urban_junction';
}

// ── קביעת transitType ──────────────────────────────────────────────────────
function getTransitType(roadNum) {
  if (roadNum > 0 && roadNum < 1000) return 'intercity';
  return 'urban';
}

// ── המרת רשומת מחוז לפורמט v3 ─────────────────────────────────────────────
function convertEntry(entry) {
  const [lat, lng]  = entry.coords;
  const osmIdNum    = parseInt(entry.id.replace(/^osm-/, '')) || 0;
  const mainRoad    = extractRoad(entry.notes);
  const routes      = entry.routes || [];
  const destinations = routes.map(r => r.to).filter(Boolean);

  // roadToDestinations: { roadNum: [dest, ...] }
  // בלי מידע על איזה כביש משרת איזה קו — נשאיר ריק
  const roadToDestinations = {};

  return {
    id:                  entry.id,
    name:                entry.name,
    osmId:               osmIdNum,
    stopId:              0,
    coordinates:         { lat, lng },
    currentRoad:         mainRoad,
    roadType:            getRoadType(entry.name, mainRoad),
    direction:           null,
    physicalConnections: mainRoad > 0 ? [mainRoad] : [],
    safetyRating:        'safe',
    transitType:         getTransitType(mainRoad),
    activeBusLinesCount: routes.length,
    gatewayFor:          destinations.slice(0, 6),
    servedDestinations:  destinations,
    roadToDestinations,
    notes:               entry.notes || '',
  };
}

// ── main ───────────────────────────────────────────────────────────────────
function main() {
  // טעינת כל קבצי המחוז
  const allRaw = [];
  for (const file of DISTRICT_FILES) {
    const filePath = path.join(DISTRICTS_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    allRaw.push(...data);
    console.log(`  📂 ${file} — ${data.length} נקודות`);
  }
  console.log(`\nסה"כ נטען: ${allRaw.length} רשומות גולמיות`);

  // דה-דופליקציה לפי id
  const seenIds  = new Set();
  const osmIdSet = new Set(); // OSM numeric IDs for quick lookup
  const districtPoints = [];

  for (const entry of allRaw) {
    if (seenIds.has(entry.id)) continue;
    seenIds.add(entry.id);
    const osmNum = parseInt(entry.id.replace(/^osm-/, '')) || 0;
    if (osmNum > 0) osmIdSet.add(osmNum);
    districtPoints.push(convertEntry(entry));
  }
  console.log(`אחרי דה-דופליקציה: ${districtPoints.length} נקודות ייחודיות`);

  // טעינת v3 להוספת נקודות שלא קיימות בקבצי המחוז
  const v3 = JSON.parse(fs.readFileSync(V3_FILE, 'utf8'));
  console.log(`\n📂 נטען v3 — ${v3.points.length} נקודות`);

  let v3Added = 0;
  for (const p of v3.points) {
    // דלג אם ה-OSM ID כבר קיים
    if (p.osmId && osmIdSet.has(p.osmId)) continue;
    if (seenIds.has(p.id)) continue;

    // דלג אם יש נקודת מחוז בסביבה קרובה (< 80m)
    const tooClose = districtPoints.some(dp =>
      distM(dp.coordinates.lat, dp.coordinates.lng,
            p.coordinates.lat, p.coordinates.lng) < 80,
    );
    if (tooClose) continue;

    districtPoints.push(p);
    seenIds.add(p.id);
    v3Added++;
  }
  console.log(`נוספו מ-v3 (לא קיימים בקבצי המחוז): ${v3Added}`);

  // מיון: צפון → דרום
  districtPoints.sort((a, b) => b.coordinates.lat - a.coordinates.lat);

  // סטטיסטיקות
  const safe    = districtPoints.filter(p => p.safetyRating === 'safe').length;
  const withBus = districtPoints.filter(p => p.activeBusLinesCount > 0).length;

  const db = {
    systemVersion:      '4.0.0',
    generatedAt:        new Date().toISOString(),
    source:             '7 district files (verified trampit points) + OSM v3 supplement',
    totalPoints:        districtPoints.length,
    fromDistricts:      districtPoints.length - v3Added,
    fromV3Supplement:   v3Added,
    points:             districtPoints,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(db, null, 2), 'utf8');

  console.log('\n══════════════════════════════════════');
  console.log('🎉 נשמר: trampitPointsDb.v4.json');
  console.log(`   סה"כ נקודות       : ${districtPoints.length}`);
  console.log(`   מקבצי מחוז        : ${districtPoints.length - v3Added}`);
  console.log(`   תוספת מ-v3        : ${v3Added}`);
  console.log(`   בטוחות            : ${safe}`);
  console.log(`   עם קווי אוטובוס   : ${withBus}`);
  console.log('══════════════════════════════════════');
}

main();
