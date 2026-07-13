import { useState, useRef, useCallback } from 'react';

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.8);
  } catch {}
}

// thresholdKm: alert fires when user is within this many km of an exit point
export function useProximityAlert(exitPoints, thresholdKm = 1.5) {
  const [isTracking, setIsTracking] = useState(false);
  const [userPos,    setUserPos]    = useState(null);   // { lat, lng }
  const [alert,      setAlert]      = useState(null);   // { location, distKm }
  const [geoError,   setGeoError]   = useState('');

  const watchId  = useRef(null);
  const alerted  = useRef(new Set());   // avoid re-alerting the same point

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('הדפדפן אינו תומך במיקום — נסה Chrome/Safari');
      return;
    }
    setGeoError('');
    setIsTracking(true);
    alerted.current.clear();

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserPos({ lat, lng });

        for (const point of exitPoints) {
          if (!point.coordinates) continue;
          const dist = haversineKm(lat, lng, point.coordinates.lat, point.coordinates.lng);
          if (dist <= thresholdKm && !alerted.current.has(point.location)) {
            alerted.current.add(point.location);
            setAlert({ location: point.location, distKm: Math.round(dist * 10) / 10 });
            playBeep();
            try { navigator.vibrate?.([200, 100, 200, 100, 400]); } catch {}
          }
        }
      },
      (err) => {
        const msg =
          err.code === 1 ? 'הרשאת מיקום נדחתה — אפשר מיקום בהגדרות הדפדפן' :
          err.code === 2 ? 'לא ניתן לאתר מיקום — בדוק GPS' :
          'שגיאה בקבלת מיקום — נסה שוב';
        setGeoError(msg);
        setIsTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }, [exitPoints, thresholdKm]);

  const stopTracking = useCallback(() => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsTracking(false);
    setUserPos(null);
    setAlert(null);
    alerted.current.clear();
  }, []);

  const dismissAlert = useCallback(() => setAlert(null), []);

  // distance from user to a specific exit point (null if not tracking)
  function distTo(point) {
    if (!userPos || !point.coordinates) return null;
    return haversineKm(userPos.lat, userPos.lng, point.coordinates.lat, point.coordinates.lng);
  }

  return { isTracking, userPos, alert, geoError, startTracking, stopTracking, dismissAlert, distTo };
}
