import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ISRAEL_CITIES } from './data/israelCities.js';
import SearchPage            from './pages/SearchPage.jsx';
import MapPage               from './pages/MapPage.jsx';
import RidePage              from './pages/RidePage.jsx';
import JunctionCardDemo      from './pages/JunctionCardDemo.jsx';
import AdminPage             from './pages/AdminPage.jsx';
import ErrorBoundary         from './components/ErrorBoundary.jsx';
import AuthScreen            from './components/AuthScreen.jsx';
import SplashScreen          from './components/SplashScreen.jsx';
import { JunctionProvider }  from './components/JunctionProvider.jsx';

// מנסה כל 3 שניות עד שהשרת עונה — מטפל ב-cold start של Render
async function wakeServer(onMessage) {
  onMessage('מתחבר לשרת...');
  let attempts = 0;
  while (true) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const r  = await fetch('/health', { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) return;
    } catch { /* timeout or network error — keep retrying */ }
    attempts++;
    if (attempts === 1) onMessage('השרת מתעורר, מיד מתחילים...');
    await new Promise(res => setTimeout(res, 3000));
  }
}

export default function App() {
  const [cities,        setCities]        = useState([]);
  const [authed,        setAuthed]        = useState(null);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashFading,  setSplashFading]  = useState(false);
  const [wakeMessage,   setWakeMessage]   = useState('מתחבר לשרת...');

  useEffect(() => {
    let cancelled = false;
    async function init() {
      await wakeServer(msg => { if (!cancelled) setWakeMessage(msg); });
      if (cancelled) return;
      fetch('/api/cities', { credentials: 'include' })
        .then(r => {
          if (r.status === 401) { setAuthed(false); return null; }
          setAuthed(true);
          return r.json();
        })
        .then(d => setCities(Array.isArray(d) && d.length > 0 ? d : ISRAEL_CITIES))
        .catch(() => { setAuthed(false); setCities(ISRAEL_CITIES); });
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // כשהמצב ידוע — מתחיל fade-out, ואחרי 550ms מסיר לגמרי
  useEffect(() => {
    if (authed !== null) {
      setSplashFading(true);
      const t = setTimeout(() => setSplashVisible(false), 550);
      return () => clearTimeout(t);
    }
  }, [authed]);

  return (
    <>
      {splashVisible && <SplashScreen fading={splashFading} message={wakeMessage} />}

      {authed !== null && (
        authed === false
          ? <AuthScreen onLogin={() => {
              setAuthed(true);
              // רשימת הערים המלאה לא נטענה כשלא היינו מחוברים — נטען עכשיו
              fetch('/api/cities', { credentials: 'include' })
                .then(r => r.ok ? r.json() : null)
                .then(d => Array.isArray(d) && d.length > 0 && setCities(d))
                .catch(() => {});
            }} />
          : <ErrorBoundary>
              <Routes>
                <Route path="/"     element={<SearchPage cities={cities} />} />
                <Route path="/map"  element={<MapPage />} />
                <Route path="/ride" element={<RidePage />} />
                <Route path="/demo" element={<JunctionProvider><JunctionCardDemo /></JunctionProvider>} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="*"     element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
      )}
    </>
  );
}
