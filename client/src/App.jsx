import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SearchPage       from './pages/SearchPage.jsx';
import MapPage          from './pages/MapPage.jsx';
import RidePage         from './pages/RidePage.jsx';
import JunctionCardDemo from './pages/JunctionCardDemo.jsx';
import ErrorBoundary    from './components/ErrorBoundary.jsx';
import LoginScreen      from './components/LoginScreen.jsx';

export default function App() {
  const [cities,    setCities]    = useState([]);
  const [authed,    setAuthed]    = useState(null); // null = טוען, true/false = ידוע

  useEffect(() => {
    fetch('/api/cities', { credentials: 'include' })
      .then(r => {
        if (r.status === 401) { setAuthed(false); return null; }
        setAuthed(true);
        return r.json();
      })
      .then(d => Array.isArray(d) && setCities(d))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null; // טוען

  if (authed === false) return <LoginScreen onLogin={() => setAuthed(true)} />;

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/"     element={<SearchPage cities={cities} />} />
        <Route path="/map"  element={<MapPage />} />
        <Route path="/ride" element={<RidePage />} />
        <Route path="/demo" element={<JunctionCardDemo />} />
        <Route path="*"     element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
