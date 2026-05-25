import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet default marker icons (Vite issue)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const JERUSALEM = [31.7683, 35.2137];

function RecenterMap({ position }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, 14);
  }, [position, map]);
  return null;
}

export default function MapComponent() {
  const [position, setPosition] = useState(JERUSALEM);
  const [hasGPS, setHasGPS] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition([pos.coords.latitude, pos.coords.longitude]);
        setHasGPS(true);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
      { timeout: 8000 }
    );
  }, []);

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      {loading && (
        <div style={styles.overlay}>מאתר מיקום...</div>
      )}

      {!loading && !hasGPS && (
        <div style={styles.gpsBanner}>
          📍 מיקום לא זמין — מציג ירושלים
        </div>
      )}

      <MapContainer
        center={position}
        zoom={14}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <RecenterMap position={position} />

        <Marker position={position}>
          <Popup>
            {hasGPS ? '📍 המיקום שלך' : '📍 ירושלים (ברירת מחדל)'}
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(13,15,20,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    fontSize: '16px',
    color: '#f0f2f7',
  },
  gpsBanner: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1000,
    background: 'rgba(13,15,20,0.85)',
    color: '#fbbf24',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    border: '1px solid rgba(251,191,36,0.3)',
  },
};
