import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const ISRAEL   = [31.5, 35.0];
const STAR_MAP = { 1: '⭐', 2: '⭐⭐', 3: '⭐⭐⭐', 4: '⭐⭐⭐⭐', 5: '⭐⭐⭐⭐⭐' };

function circleIcon(color, size = 20) {
  return L.divIcon({
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
    className: '',
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor:[0, -size / 2 - 2],
  });
}

const userIcon  = circleIcon('#ef4444', 20);
const spotIcon  = circleIcon('#2563eb', 18);
const pointIcon = circleIcon('#059669', 16);

// Centers map ONCE when GPS first locks — never interferes with manual panning after that
function FirstCenter({ gps }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (gps && !done.current) {
      done.current = true;
      map.flyTo([gps.lat, gps.lng], 14, { duration: 1.5 });
    }
  }, [gps, map]);
  return null;
}

// Handles "fly to me" button — incrementing trigger fires flyTo
function FlyToMe({ trigger, gps }) {
  const map  = useMap();
  const prev = useRef(0);
  useEffect(() => {
    if (trigger !== prev.current && gps) {
      prev.current = trigger;
      map.flyTo([gps.lat, gps.lng], 15, { duration: 1 });
    }
  }, [trigger, gps, map]);
  return null;
}

export default function MapComponent({ spots = [], points = [] }) {
  const [gps,        setGps]        = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [flyTrigger, setFlyTrigger] = useState(0);

  useEffect(() => {
    const prevent = e => e.preventDefault();
    document.addEventListener('gesturestart',  prevent, { passive: false });
    document.addEventListener('gesturechange', prevent, { passive: false });
    document.addEventListener('gestureend',    prevent, { passive: false });
    return () => {
      document.removeEventListener('gesturestart',  prevent);
      document.removeEventListener('gesturechange', prevent);
      document.removeEventListener('gestureend',    prevent);
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) { setLoading(false); return; }
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setLoading(false);
      },
      () => setLoading(false),
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 3000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const gpsPos = gps ? [gps.lat, gps.lng] : null;

  return (
    <div style={st.wrap}>
      {loading && <div style={st.overlay}>מאתר מיקום...</div>}

      <MapContainer
        center={ISRAEL}
        zoom={8}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <FirstCenter gps={gps} />
        <FlyToMe trigger={flyTrigger} gps={gps} />

        {/* מיקום המשתמש + עיגול דיוק */}
        {gps && (
          <>
            <Circle
              center={gpsPos}
              radius={Math.max(gps.accuracy, 10)}
              pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.1, weight: 1.5, dashArray: '5' }}
            />
            <Marker position={gpsPos} icon={userIcon}>
              <Popup>
                <div style={p.wrap}>
                  <b>📍 המיקום שלך</b>
                  <div style={p.sub}>דיוק: ~{Math.round(gps.accuracy)}מ׳</div>
                </div>
              </Popup>
            </Marker>
          </>
        )}

        {/* נקודות טרמפ מה-DB */}
        {points.map(pt => (
          <Marker key={pt.id} position={[pt.coordinates.lat, pt.coordinates.lng]} icon={pointIcon}>
            <Popup>
              <div style={p.wrap}>
                <div style={p.title}>{pt.name}</div>
                <div style={p.row}>כיוון: {pt.direction}</div>
                {pt.servedDestinations?.length > 0 && (
                  <div style={{ ...p.row, color: '#2563eb' }}>→ {pt.servedDestinations.slice(0, 3).join(' · ')}</div>
                )}
                {pt.activeBusLinesCount > 0 && (
                  <div style={{ ...p.row, color: '#059669' }}>🚌 {pt.activeBusLinesCount} קווים פעילים</div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* נקודות קהילתיות */}
        {spots.filter(s => s.coordinates?.lat && s.coordinates?.lng).map(spot => (
          <Marker key={spot.id} position={[spot.coordinates.lat, spot.coordinates.lng]} icon={spotIcon}>
            <Popup>
              <div style={p.wrap}>
                <div style={p.title}>{spot.name}</div>
                <div style={p.row}>{spot.city} · {spot.direction}</div>
                {spot.rating > 0 && <div style={p.row}>{STAR_MAP[Math.round(spot.rating)]}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* כפתור "חזור אליי" */}
      {gps && (
        <button style={st.centerBtn} onClick={() => setFlyTrigger(t => t + 1)} title="חזור למיקום שלי">
          🎯
        </button>
      )}

      {/* מקרא */}
      <div style={st.legend}>
        <span style={st.legendItem}><span style={{ ...st.dot, background: '#ef4444' }} />אתה</span>
        <span style={st.legendItem}><span style={{ ...st.dot, background: '#059669' }} />טרמפ</span>
        <span style={st.legendItem}><span style={{ ...st.dot, background: '#2563eb' }} />קהילה</span>
      </div>
    </div>
  );
}

const st = {
  wrap: { position: 'relative', width: '100%', height: '100%', minHeight: 200 },
  overlay: {
    position: 'absolute', inset: 0, zIndex: 1000,
    background: 'rgba(13,15,20,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 15, color: '#f0f2f7',
  },
  centerBtn: {
    position: 'absolute', top: 80, right: 10, zIndex: 1000,
    background: '#fff', border: '2px solid rgba(0,0,0,0.2)',
    borderRadius: 4, width: 34, height: 34,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 17, cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)', padding: 0,
    touchAction: 'manipulation',
  },
  legend: {
    position: 'absolute', bottom: 10, left: 10, zIndex: 1000,
    background: 'rgba(255,255,255,0.93)',
    borderRadius: 8, padding: '5px 10px',
    display: 'flex', gap: 10, fontSize: 11, color: '#1f2937',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4 },
  dot: { width: 9, height: 9, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
};

const p = {
  wrap:  { direction: 'rtl', textAlign: 'right', minWidth: 155 },
  title: { fontWeight: 700, fontSize: 14, marginBottom: 4, color: '#111' },
  row:   { fontSize: 12, color: '#4b5563', marginBottom: 2 },
  sub:   { fontSize: 11, color: '#9ca3af', marginTop: 3 },
};
