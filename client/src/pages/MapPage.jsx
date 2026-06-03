import { useState, useEffect, useRef, useCallback } from 'react';
import Layout       from '../components/Layout.jsx';
import MapComponent from '../components/MapComponent.jsx';

export default function MapPage() {
  const [spots,  setSpots]  = useState([]);
  const [points, setPoints] = useState([]);
  const fetchTimer = useRef(null);

  useEffect(() => {
    fetch('/api/spots', { credentials: 'include' })
      .then(r => r.json()).then(d => Array.isArray(d) && setSpots(d)).catch(() => {});
  }, []);

  const handleBoundsChange = useCallback((bounds) => {
    clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(() => {
      const s = bounds.getSouth().toFixed(5);
      const w = bounds.getWest().toFixed(5);
      const n = bounds.getNorth().toFixed(5);
      const e = bounds.getEast().toFixed(5);
      fetch(`/api/points?bbox=${s},${w},${n},${e}`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => Array.isArray(d) && setPoints(d))
        .catch(() => {});
    }, 500);
  }, []);

  return (
    <Layout mapMode>
      <div style={s.mapWrap}>
        <MapComponent spots={spots} points={points} onBoundsChange={handleBoundsChange} />
      </div>
    </Layout>
  );
}

const s = {
  mapWrap: { flex: 1, minHeight: 0, position: 'relative' },
};
