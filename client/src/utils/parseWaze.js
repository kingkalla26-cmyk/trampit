/**
 * Parses a Waze share URL and returns { lat, lng } or { cityName } or null.
 *
 * Formats handled:
 *   1. https://waze.com/ul?ll=31.7683,35.2137                   → { lat, lng }
 *   2. https://ul.waze.com/ul?ll=31.7683%2C35.2137&zoom=17      → { lat, lng }
 *   3. waze://ul?ll=31.7683,35.2137                             → { lat, lng }
 *   4. https://www.waze.com/live-map/directions/ashkelon-...    → { cityName: "Ashkelon" }
 */
export function parseWazeUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw.trim();

  // 1. ?ll=lat,lng  (handles comma and URL-encoded %2C)
  const llMatch = text.match(/[?&]ll=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i);
  if (llMatch) {
    const lat = parseFloat(llMatch[1]);
    const lng = parseFloat(llMatch[2]);
    if (isValidIsrael(lat, lng)) return { lat, lng };
  }

  // 2. to=ll.lat,lng  (directions with inline coords)
  const toMatch = text.match(/[?&]to=ll\.(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (toMatch) {
    const lat = parseFloat(toMatch[1]);
    const lng = parseFloat(toMatch[2]);
    if (isValidIsrael(lat, lng)) return { lat, lng };
  }

  // 3. live-map/directions/{city-slug}  (Waze web share)
  const dirMatch = text.match(/live-map\/directions\/([a-z0-9][a-z0-9-]+?)(?:[?&#]|$)/i);
  if (dirMatch) {
    const cityName = slugToCity(dirMatch[1]);
    if (cityName) return { cityName };
  }

  return null;
}

// ── Known district / sub-district suffixes to strip from Waze slugs ──────────
const DISTRICT_SUFFIXES = [
  '-judea-and-samaria-area',
  '-southern-district',
  '-northern-district',
  '-center-district',
  '-south-district',
  '-north-district',
  '-haifa-district',
  '-tel-aviv-district',
  '-jerusalem-district',
  '-haifa',
  '-tel-aviv',
  '-jerusalem',
];

function slugToCity(slug) {
  let s = slug.toLowerCase();
  s = s.replace(/-il$/, '');            // remove -il country suffix
  for (const d of DISTRICT_SUFFIXES) { // remove district suffix
    if (s.endsWith(d)) { s = s.slice(0, -d.length); break; }
  }
  if (!s) return null;
  return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function isValidIsrael(lat, lng) {
  return lat >= 29 && lat <= 34 && lng >= 34 && lng <= 36;
}
