import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const JERUSALEM = [31.7683, 35.2137];
const STAR_MAP  = { 1: '⭐', 2: '⭐⭐', 3: '⭐⭐⭐', 4: '⭐⭐⭐⭐', 5: '⭐⭐⭐⭐⭐' };

function circleIcon(color) {
  return L.divIcon({
    html: `<div style="background:${color};width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12],
  });
}

const spotIcon = circleIcon('#2563eb');
const userIcon = circleIcon('#ef4444');

function RecenterMap({ position, zoom }) {
  const map = useMap();
  useEffect(() => { map.setView(position, zoom); }, [position, zoom, map]);
  return null;
}

export default function MapComponent({ spots = [] }) {
  const [position, setPosition] = useState(JERUSALEM);
  const [hasGPS, setHasGPS]     = useState(false);
  const [loading, setLoading]   = useState(true);

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

  const spotsOnMap = spots.filter(s => s.coordinates?.lat && s.coordinates?.lng);

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      {loading && <div style={styles.overlay}>מאתר מיקום...</div>}
      {!loading && !hasGPS && (
        <div style={styles.gpsBanner}>📍 מיקום לא זמין — מציג ישראל</div>
      )}

      <MapContainer center={JERUSALEM} zoom={8} style={{ width: '100%', height: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <RecenterMap position={position} zoom={hasGPS ? 14 : 8} />

        <Marker position={position} icon={userIcon}>
          <Popup>{hasGPS ? '📍 המיקום שלך' : '📍 ירושלים (ברירת מחדל)'}</Popup>
        </Marker>

        {spotsOnMap.map(spot => (
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
    </div>
  );
}

const styles = {
  overlay: {
    position: 'absolute', inset: 0,
    background: 'rgba(13,15,20,0.8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, fontSize: 16, color: '#f0f2f7',
  },
  gpsBanner: {
    position: 'absolute', top: 12, right: 12, zIndex: 1000,
    background: 'rgba(13,15,20,0.85)', color: '#fbbf24',
    padding: '8px 14px', borderRadius: 8, fontSize: 13,
    border: '1px solid rgba(251,191,36,0.3)',
  },
};
