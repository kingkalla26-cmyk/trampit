import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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

const userIcon  = circleIcon('#ef4444', 18);
const spotIcon  = circleIcon('#2563eb', 16);
const pointIcon = circleIcon('#059669', 14);

function RecenterMap({ position, zoom }) {
  const map = useMap();
  useEffect(() => { map.setView(position, zoom); }, [position, zoom, map]);
  return null;
}

export default function MapComponent({ spots = [], points = [] }) {
  const [position, setPosition] = useState(ISRAEL);
  const [hasGPS,   setHasGPS]   = useState(false);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) { setLoading(false); return; }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition([pos.coords.latitude, pos.coords.longitude]);
        setHasGPS(true);
        setLoading(false);
      },
      () => setLoading(false),
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return (
    <div style={styles.wrap}>
      {loading && <div style={styles.overlay}>מאתר מיקום...</div>}

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

        <RecenterMap position={position} zoom={hasGPS ? 13 : 8} />

        {/* מיקום המשתמש */}
        <Marker position={position} icon={userIcon}>
          <Popup><b>{hasGPS ? '📍 המיקום שלך' : '📍 ישראל'}</b></Popup>
        </Marker>

        {/* נקודות טרמפ מאומתות מה-DB */}
        {points.map(p => (
          <Marker
            key={p.id}
            position={[p.coordinates.lat, p.coordinates.lng]}
            icon={pointIcon}
          >
            <Popup>
              <div style={{ direction: 'rtl', textAlign: 'right', minWidth: 150 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: '#4b5563', marginBottom: 2 }}>
                  כיוון: {p.direction} · כביש {p.currentRoad || ''}
                </div>
                {p.activeBusLinesCount > 0 && (
                  <div style={{ fontSize: 12, color: '#059669' }}>
                    🚌 {p.activeBusLinesCount} קווים פעילים
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* נקודות קהילתיות */}
        {spots.filter(s => s.coordinates?.lat && s.coordinates?.lng).map(spot => (
          <Marker
            key={spot.id}
            position={[spot.coordinates.lat, spot.coordinates.lng]}
            icon={spotIcon}
          >
            <Popup>
              <div style={{ direction: 'rtl', textAlign: 'right', minWidth: 130 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{spot.name}</div>
                <div style={{ fontSize: 12, color: '#4b5563' }}>{spot.city} · {spot.direction}</div>
                {spot.rating > 0 && (
                  <div style={{ fontSize: 12, marginTop: 4 }}>{STAR_MAP[Math.round(spot.rating)]}</div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* מקרא */}
      <div style={styles.legend}>
        <span style={styles.legendItem}><span style={{ ...styles.dot, background: '#ef4444' }} />אתה</span>
        <span style={styles.legendItem}><span style={{ ...styles.dot, background: '#059669' }} />נקודת טרמפ</span>
        <span style={styles.legendItem}><span style={{ ...styles.dot, background: '#2563eb' }} />קהילה</span>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: 200,
  },
  overlay: {
    position: 'absolute', inset: 0, zIndex: 1000,
    background: 'rgba(13,15,20,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 15, color: '#f0f2f7',
  },
  legend: {
    position: 'absolute', bottom: 10, right: 10, zIndex: 1000,
    background: 'rgba(255,255,255,0.92)',
    borderRadius: 8, padding: '6px 10px',
    display: 'flex', gap: 10, fontSize: 12, color: '#1f2937',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
};
