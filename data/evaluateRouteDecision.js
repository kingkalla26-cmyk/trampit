/**
 * Trampit Route Decision Engine v2 (Junction System)
 * מנוע החלטות מבוסס חוקים תשתיתיים וגיאוגרפיים קשיחים.
 */

const trampitDb = require('./trampitPointsDb.v2.json');

/**
 * נוסחת האוורסין לחישוב מרחק אווירי מדויק בין שתי קואורדינטות (במטרים)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * בודק אם הנקודה משרתת את יעד הנסיעה של הטרמפיסט
 * @param {Object} point - נקודה מה-DB
 * @param {string} userTargetDestination - יעד הנסיעה של הטרמפיסט
 */
function pointServesDestination(point, userTargetDestination) {
    if (!userTargetDestination || !Array.isArray(point.servedDestinations)) return false;
    const target = userTargetDestination.trim();
    return point.servedDestinations.some(d =>
        target.includes(d) || d.includes(target)
    );
}

/**
 * מחשב ומחזיר החלטת ניווט לטרמפיסט
 * @param {Object} userLocation - המיקום הנוכחי { lat, lng }
 * @param {Object} routeContext - { userTargetDestination, driverNextRoad }
 * @param {Array<string>} remainingPointIds - מזהי הנקודות שנותרו במסלול הנהג
 */
function evaluateRouteDecision(userLocation, routeContext, remainingPointIds) {
    const { userTargetDestination, driverNextRoad } = routeContext;

    // חוק ברזל 1: אין נקודות בהמשך
    if (!remainingPointIds || remainingPointIds.length === 0) {
        return {
            decision: "continue_ride",
            reason: "אין נקודות הורדה מוסדרות בהמשך מסלול הרכב. הישאר בטרמפ.",
            confidence: "high"
        };
    }

    const remainingPOIs = remainingPointIds
        .map(id => trampitDb.points.find(p => p.id === id))
        .filter(p => p !== undefined);

    if (remainingPOIs.length === 0) {
        return {
            decision: "continue_ride",
            reason: "לא נמצאו נקודות החלפה מאומתות במאגר.",
            confidence: "low"
        };
    }

    const nextPoint = remainingPOIs[0];

    const distanceToPoint = calculateDistance(
        userLocation.lat, userLocation.lng,
        nextPoint.coordinates.lat, nextPoint.coordinates.lng
    );

    // חוק ברזל 2: סינון בטיחות — נקודה בטוחה רק אם safe + לא כביש מהיר פתוח
    const isPointSafeToGetOff =
        nextPoint.safetyRating === "safe" &&
        nextPoint.roadType !== "highway";

    // חוק ברזל 3: האם הנקודה הזו משרתת את יעד הנסיעה של הטרמפיסט?
    // תיקון: בעבר הלוגיקה בדקה physicalConnections בלבד וכשלה —
    // למשל במחלף לטרון גם כביש 1 וגם כביש 3 בחיבורים, אך רק אחד מוביל ליעד.
    // כעת אנו בודקים ישירות את servedDestinations של הנקודה.
    const driverHeadsToDestination = pointServesDestination(nextPoint, userTargetDestination);

    // הנהג מתפצל אם: הנקודה לא משרתת את יעד הטרמפיסט
    // OR הכביש שהנהג ממשיך אליו לא עובר דרך הנקודה כלל
    const driverPassesJunction = nextPoint.physicalConnections.includes(driverNextRoad);
    const isDriverDiverging = !driverHeadsToDestination || !driverPassesJunction;

    if (isDriverDiverging) {
        if (isPointSafeToGetOff && nextPoint.activeBusLinesCount > 0) {
            return {
                decision: "get_off_now",
                reason: `הנהג פונה לכיוון שאינו מוביל ל${userTargetDestination}. רד ב-${nextPoint.name} (מרחק: ${Math.round(distanceToPoint)} מטר). הנקודה בטוחה עם ${nextPoint.activeBusLinesCount} קווים פעילים.`,
                confidence: "high"
            };
        }

        const hasBetterPointAhead = remainingPOIs.slice(1).some(p =>
            p.safetyRating === "safe" && p.activeBusLinesCount > nextPoint.activeBusLinesCount
        );

        if (hasBetterPointAhead) {
            return {
                decision: "get_off_later",
                reason: `הצומת הקרוב (${nextPoint.name}) מסוכן או ללא תח"צ מספקת. זוהתה נקודת החלפה בטוחה יותר בהמשך הדרך.`,
                confidence: "high"
            };
        }

        return {
            decision: "continue_ride",
            reason: "הנהג מתפצל, אך נקודת הירידה מסוכנת ולא נמצא חלון יציאה בטוח בהמשך.",
            confidence: "low"
        };
    }

    // חוק ברזל 4: הנהג ממשיך על הציר הנכון
    return {
        decision: "continue_ride",
        reason: `הרכב נוסע על ציר הכבישים המוביל ישירות ל${userTargetDestination}. אין צורך לרדת.`,
        confidence: "high"
    };
}

module.exports = { evaluateRouteDecision };
