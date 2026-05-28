/**
 * Trampit Route Decision Engine v2 (Junction System)
 * מנוע החלטות מבוסס חוקים תשתיתיים וגיאוגרפיים קשיחים.
 */

const fs   = require('fs');
const path = require('path');

function loadDb() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'trampitPointsDb.v2.json'), 'utf8'));
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi   = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(deltaPhi / 2) ** 2 +
            Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointServesDestination(point, userTargetDestination) {
  if (!userTargetDestination || !Array.isArray(point.servedDestinations)) return false;
  const target = userTargetDestination.trim();
  return point.servedDestinations.some(d => target.includes(d) || d.includes(target));
}

/**
 * מחשב ומחזיר החלטת ניווט לטרמפיסט
 * @param {Object} userLocation       - { lat, lng }
 * @param {Object} routeContext       - { userTargetDestination, driverNextRoad }
 * @param {Array<string>} remainingPointIds
 */
function evaluateRouteDecision(userLocation, routeContext, remainingPointIds) {
  const { userTargetDestination, driverNextRoad } = routeContext;

  if (!remainingPointIds || remainingPointIds.length === 0) {
    return {
      decision:   'continue_ride',
      reason:     'אין נקודות הורדה מוסדרות בהמשך מסלול הרכב. הישאר בטרמפ.',
      confidence: 'high',
    };
  }

  const db = loadDb();

  const remainingPOIs = remainingPointIds
    .map(id => db.points.find(p => p.id === id))
    .filter(Boolean);

  if (remainingPOIs.length === 0) {
    return {
      decision:   'continue_ride',
      reason:     'לא נמצאו נקודות החלפה מאומתות במאגר.',
      confidence: 'low',
    };
  }

  const nextPoint = remainingPOIs[0];

  const distanceToPoint = calculateDistance(
    userLocation.lat, userLocation.lng,
    nextPoint.coordinates.lat, nextPoint.coordinates.lng,
  );

  const isPointSafeToGetOff =
    nextPoint.safetyRating === 'safe' && nextPoint.roadType !== 'highway';

  const driverHeadsToDestination = pointServesDestination(nextPoint, userTargetDestination);

  // תיקון באג: כש-driverNextRoad הוא 0 (ברירת מחדל / לא ידוע) —
  // לא בודקים physicalConnections כי אף כביש לא ממוספר 0.
  // רק כשנשלח מספר כביש אמיתי (>0) אנחנו בודקים אם הנהג עוקף את הצומת.
  const roadKnown = typeof driverNextRoad === 'number' && driverNextRoad > 0;
  const driverBypassesJunction = roadKnown && !nextPoint.physicalConnections.includes(driverNextRoad);

  const isDriverDiverging = !driverHeadsToDestination || driverBypassesJunction;

  if (isDriverDiverging) {
    if (isPointSafeToGetOff && nextPoint.activeBusLinesCount > 0) {
      return {
        decision:   'get_off_now',
        reason:     `הנהג פונה לכיוון שאינו מוביל ל${userTargetDestination}. רד ב-${nextPoint.name} (מרחק: ${Math.round(distanceToPoint)} מטר). הנקודה בטוחה עם ${nextPoint.activeBusLinesCount} קווים פעילים.`,
        confidence: 'high',
      };
    }

    const hasBetterPointAhead = remainingPOIs.slice(1).some(
      p => p.safetyRating === 'safe' && p.activeBusLinesCount > nextPoint.activeBusLinesCount,
    );

    if (hasBetterPointAhead) {
      return {
        decision:   'get_off_later',
        reason:     `הצומת הקרוב (${nextPoint.name}) מסוכן או ללא תח"צ מספקת. זוהתה נקודת החלפה בטוחה יותר בהמשך הדרך.`,
        confidence: 'high',
      };
    }

    return {
      decision:   'continue_ride',
      reason:     'הנהג מתפצל, אך נקודת הירידה מסוכנת ולא נמצא חלון יציאה בטוח בהמשך.',
      confidence: 'low',
    };
  }

  return {
    decision:   'continue_ride',
    reason:     `הרכב נוסע על ציר הכבישים המוביל ישירות ל${userTargetDestination}. אין צורך לרדת.`,
    confidence: 'high',
  };
}

module.exports = { evaluateRouteDecision };
