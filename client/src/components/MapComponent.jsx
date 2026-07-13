import { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from '@changey/react-leaflet-markercluster';
import L from 'leaflet';
import 'leaflet-rotate';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { IconPin, IconBus, IconNavigation, IconTarget, IconCompass } from '../icons.jsx';

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

// אייקון עם קונוס כיוון — SVG מסובב לפי heading המצפן
function makeUserIcon(heading) {
  const hasCone = heading !== null;
  const rot     = hasCone ? heading : 0;
  // קונוס: מרכז (30,30), רדיוס 24px, שדה ראייה 60°
  // קצה שמאלי (−30° מצפון): x=30+24·sin(−30°)=18, y=30−24·cos(30°)=9.2
  // קצה ימני (+30°): x=42, y=9.2
  const cone = hasCone
    ? `<path d="M30,30 L18,9 A24,24,0,0,1,42,9 Z"
         fill="rgba(var(--primary-rgb),0.30)" stroke="rgba(var(--primary-rgb),0.75)"
         stroke-width="1.5" stroke-linejoin="round"/>`
    : '';
  return L.divIcon({
    html: `<div style="width:60px;height:60px;transform:rotate(${rot}deg);transform-origin:30px 30px">
      <svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
        ${cone}
        <circle cx="30" cy="30" r="10" fill="var(--destructive)" stroke="white" stroke-width="3"/>
      </svg>
    </div>`,
    className: '',
    iconSize:   [60, 60],
    iconAnchor: [30, 30],
    popupAnchor:[0, -12],
  });
}

const spotIcon     = circleIcon('var(--primary)', 18);
const verifiedIcon = circleIcon('var(--accent)', 16);
const autoIcon     = circleIcon('var(--muted-foreground)', 12);

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

function BoundsWatcher({ onBoundsChange }) {
  const map = useMapEvents({
    moveend: (e) => onBoundsChange(e.target.getBounds()),
    zoomend: (e) => onBoundsChange(e.target.getBounds()),
  });
  useEffect(() => { onBoundsChange(map.getBounds()); }, [map, onBoundsChange]);
  return null;
}

function CompassControl({ onBearingChange }) {
  const map = useMap();
  useEffect(() => {
    const update = () => onBearingChange(map.getBearing?.() ?? 0);
    map.on('rotate', update);
    return () => map.off('rotate', update);
  }, [map, onBearingChange]);
  return null;
}

export default function MapComponent({ spots = [], points = [], onBoundsChange }) {
  const [gps,              setGps]              = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [flyTrigger,       setFlyTrigger]       = useState(0);
  const [bearing,          setBearing]          = useState(0);
  const [heading,          setHeading]          = useState(null);
  const [iosNeedsPerm,     setIosNeedsPerm]     = useState(false);

  const mapRef        = useRef(null);
  const lastHUpdate   = useRef(0);
  const orientHandler = useRef(null);

  // GPS
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

  // מצפן — Device Orientation
  useEffect(() => {
    orientHandler.current = (e) => {
      let h = null;
      if (typeof e.webkitCompassHeading === 'number') {
        // iOS — ישירות בדרגות מצפון
        h = e.webkitCompassHeading;
      } else if (typeof e.alpha === 'number') {
        // Android — alpha הוא סיבוב ממזרח, הופכים לצפון
        h = (360 - e.alpha + 360) % 360;
      }
      if (h === null) return;
      const now = Date.now();
      if (now - lastHUpdate.current < 150) return; // throttle 150ms
      lastHUpdate.current = now;
      setHeading(Math.round(h));
    };

    if (typeof DeviceOrientationEvent === 'undefined') return;

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS 13+ — צריך הרשאה מפורשת
      setIosNeedsPerm(true);
    } else {
      window.addEventListener('deviceorientation', orientHandler.current, true);
    }

    return () => {
      if (orientHandler.current)
        window.removeEventListener('deviceorientation', orientHandler.current, true);
    };
  }, []);

  const requestHeadingPerm = useCallback(async () => {
    try {
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm === 'granted') {
        setIosNeedsPerm(false);
        window.addEventListener('deviceorientation', orientHandler.current, true);
      } else {
        setIosNeedsPerm(false);
      }
    } catch {
      setIosNeedsPerm(false);
    }
  }, []);

  const gpsPos   = gps ? [gps.lat, gps.lng] : null;
  const userIcon = makeUserIcon(heading);

  return (
    <div style={st.wrap}>
      {loading && <div style={st.overlay}>מאתר מיקום...</div>}

      <MapContainer
        center={ISRAEL}
        zoom={8}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
        rotate={true}
        touchRotate={true}
        ref={mapRef}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <FirstCenter gps={gps} />
        <FlyToMe trigger={flyTrigger} gps={gps} />
        <CompassControl onBearingChange={setBearing} />
        {onBoundsChange && <BoundsWatcher onBoundsChange={onBoundsChange} />}

        {gps && (
          <>
            <Circle
              center={gpsPos}
              radius={Math.max(gps.accuracy, 10)}
              pathOptions={{ color: 'var(--destructive)', fillColor: 'var(--destructive)', fillOpacity: 0.1, weight: 1.5, dashArray: '5' }}
            />
            <Marker position={gpsPos} icon={userIcon}>
              <Popup>
                <div style={p.wrap}>
                  <b style={p.titleRow}><IconPin size={13} style={{ color: 'var(--primary)' }} /> המיקום שלך</b>
                  <div style={p.sub}>דיוק: ~{Math.round(gps.accuracy)}מ׳</div>
                  {heading !== null && <div style={p.sub}>כיוון: {heading}°</div>}
                </div>
              </Popup>
            </Marker>
          </>
        )}

        <MarkerClusterGroup chunkedLoading disableClusteringAtZoom={15} maxClusterRadius={60}>
          {points.map(pt => (
            <Marker key={pt.id} position={[pt.coordinates.lat, pt.coordinates.lng]} icon={pt.isVerified ? verifiedIcon : autoIcon}>
              <Popup>
                <div style={p.wrap}>
                  <div style={p.title}>{pt.name}</div>
                  {pt.direction
                    ? <div style={p.row}>כיוון: {pt.direction}</div>
                    : pt.currentRoad > 0 && <div style={p.row}>כביש: {pt.currentRoad}</div>
                  }
                  {pt.servedDestinations?.length > 0 && (
                    <div style={{ ...p.row, color: 'var(--primary)' }}>→ {pt.servedDestinations.slice(0, 3).join(' · ')}</div>
                  )}
                  {pt.activeBusLinesCount > 0 && (
                    <div style={{ ...p.row, ...p.rowIcon, color: 'var(--accent)' }}><IconBus size={12} /> {pt.activeBusLinesCount} קווים פעילים</div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

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
        </MarkerClusterGroup>
      </MapContainer>

      {/* כפתור מצפן — מאפס לצפון כשהמפה מסובבת */}
      {bearing !== 0 && (
        <button style={st.compassBtn} onClick={() => mapRef.current?.setBearing(0)} title="אפס לצפון">
          <span style={{ display: 'inline-block', transform: `rotate(${-bearing}deg)` }}>
            <IconCompass size={17} style={{ color: 'var(--foreground)' }} />
          </span>
        </button>
      )}

      {/* כפתור הרשאת כיוון — iOS בלבד */}
      {iosNeedsPerm && (
        <button style={st.headingBtn} onClick={requestHeadingPerm} title="הפעל כיוון מבט">
          <IconNavigation size={16} style={{ color: 'var(--foreground)' }} />
        </button>
      )}

      {/* כפתור חזור אליי */}
      {gps && (
        <button style={st.centerBtn} onClick={() => setFlyTrigger(t => t + 1)} title="חזור למיקום שלי">
          <IconTarget size={16} style={{ color: 'var(--foreground)' }} />
        </button>
      )}

      {/* מקרא */}
      <div style={st.legend}>
        <span style={st.legendItem}><span style={{ ...st.dot, background: 'var(--destructive)' }} />אתה</span>
        <span style={st.legendItem}><span style={{ ...st.dot, background: 'var(--accent)' }} />מאומת</span>
        <span style={st.legendItem}><span style={{ ...st.dot, background: 'var(--muted-foreground)' }} />אוטומטי</span>
        <span style={st.legendItem}><span style={{ ...st.dot, background: 'var(--primary)' }} />קהילה</span>
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
    fontSize: 15, color: 'var(--muted)',
  },
  compassBtn: {
    position: 'absolute', top: 44, right: 10, zIndex: 1000,
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', boxShadow: 'var(--shadow-md)', padding: 0,
    touchAction: 'manipulation',
  },
  headingBtn: {
    position: 'absolute', top: 86, right: 10, zIndex: 1000,
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: 'var(--shadow-md)', padding: 0,
    touchAction: 'manipulation',
  },
  centerBtn: {
    position: 'absolute', top: 128, right: 10, zIndex: 1000,
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: 'var(--shadow-md)', padding: 0,
    touchAction: 'manipulation',
  },
  legend: {
    position: 'absolute', bottom: 10, left: 10, zIndex: 1000,
    display: 'flex', gap: 6, flexWrap: 'wrap',
  },
  legendItem: {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 999, padding: '5px 10px',
    fontSize: 11, fontWeight: 600, color: 'var(--foreground)',
    boxShadow: 'var(--shadow-sm)',
  },
  dot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
};

const p = {
  wrap:  { direction: 'rtl', textAlign: 'right', minWidth: 155, fontFamily: 'var(--font-body)' },
  titleRow: { display: 'flex', alignItems: 'center', gap: 5 },
  title: { fontWeight: 700, fontSize: 14, marginBottom: 4, color: 'var(--foreground)' },
  row:   { fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 2 },
  rowIcon: { display: 'flex', alignItems: 'center', gap: 4 },
  sub:   { fontSize: 11, color: 'var(--muted-foreground)', marginTop: 3 },
};
