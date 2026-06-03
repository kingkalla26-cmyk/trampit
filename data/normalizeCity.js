/**
 * City name normalization for trampit destination matching.
 * Handles abbreviations, קריית/קרית variants, station suffixes, compound routes.
 */

// Common user abbreviations → canonical Hebrew city names
const ALIASES = {
  'ת"א':          'תל אביב',
  "ת'א":          'תל אביב',
  'ת.א':          'תל אביב',
  'ת.א.':         'תל אביב',
  'תא':           'תל אביב',
  'י-ם':          'ירושלים',
  "י'ם":          'ירושלים',
  'ירשלים':       'ירושלים',
  'ב"ש':          'באר שבע',
  'ב.ש':          'באר שבע',
  'ק"ש':          'קרית שמונה',
  'ק.ש':          'קרית שמונה',
  'פ"ת':          'פתח תקווה',
  'פ.ת':          'פתח תקווה',
  'ר"ג':          'רמת גן',
  'ר.ג':          'רמת גן',
  'ר"ל':          'ראשון לציון',
  'כ"ס':          'כפר סבא',
  'נ"צ':          'נס ציונה',
  'ב"ב':          'בני ברק',
  'מ"ע':          'מודיעין',
};

// Normalize a string: strip quotes, unify קריית↔קרית, collapse spaces
function normalize(s) {
  if (!s) return '';
  return s
    .replace(/["""״'']/g, '')       // strip all quote variants
    .replace(/קריית/g, 'קרית')      // unify spelling variant
    .replace(/\s+/g, ' ')
    .trim();
}

// Resolve user-typed alias to canonical form
function resolveAlias(input) {
  if (!input) return '';
  const trimmed = input.trim();
  // Check original (with quotes) first, then stripped variant
  if (ALIASES[trimmed]) return ALIASES[trimmed];
  const stripped = trimmed.replace(/["""״'']/g, '').trim();
  return ALIASES[stripped] || ALIASES[normalize(stripped)] || trimmed;
}

// Strip common station/terminal suffixes from a DB destination part.
// "תל אביב יפו – תחנה מרכזית"  → "תל אביב"
// "ת. מרכזית תל אביב"          → "תל אביב"
// "תל אביב-יפו"                → "תל אביב"
function stripStation(s) {
  return s
    .replace(/^ת\.?\s*מרכזית\s+/u, '')           // "ת. מרכזית X" prefix
    .replace(/^ת\.?\s*רכ["']?ל\s+/u, '')         // "ת. רכ"ל X" prefix
    .replace(/\s*[–\-]\s*.+$/u, '')              // " – תחנה מרכזית / anything" suffix
    .replace(/\s*-?יפו$/u, '')                   // "תל אביב-יפו" → "תל אביב"
    .replace(/\(.*?\)/g, '')                     // parenthetical "(ד אשדוד)"
    .trim();
}

/**
 * Returns true if a DB destination string serves the user's city.
 * Handles:
 *   - Compound routes: "ירושלים – תחנה מרכזית / אילת – תחנה מרכזית"
 *   - Station suffixes: "תל אביב יפו – תחנה מרכזית" matches "תל אביב"
 *   - "ת. מרכזית X" prefix
 *   - קריית/קרית spelling variants
 *   - User abbreviations via ALIASES
 */
function destinationMatchesCity(dbDest, userCity) {
  if (!dbDest || !userCity) return false;

  const resolved  = resolveAlias(userCity);
  const normUser  = normalize(resolved);
  if (!normUser) return false;

  // Split compound destinations on "/"
  const parts = dbDest.split('/').map(p => p.trim()).filter(Boolean);

  return parts.some(part => {
    const normPart    = normalize(part);
    const normStripped = normalize(stripStation(part));

    // Check full part and stripped version against user input (bidirectional includes)
    const candidates = [normPart, normStripped].filter(Boolean);
    return candidates.some(c =>
      c.includes(normUser) || normUser.includes(c),
    );
  });
}

module.exports = { normalize, resolveAlias, destinationMatchesCity };
