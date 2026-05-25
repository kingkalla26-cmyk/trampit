import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SearchPage    from './pages/SearchPage.jsx';
import MapPage       from './pages/MapPage.jsx';
import LoginScreen   from './components/LoginScreen.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

async function fetchCities() {
  const r = await fetch('/api/cities', { credentials: 'include' });
  if (!r.ok) return { authed: r.status !== 401, cities: [] };
  const cities = await r.json();
  return { authed: true, cities: Array.isArray(cities) ? cities : [] };
}

export default function App() {
  const [authed, setAuthed] = useState(null);
  const [cities, setCities] = useState([]);

  useEffect(() => {
    fetchCities()
      .then(({ authed, cities }) => { setAuthed(authed); setCities(cities); })
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null;

  if (!authed) return (
    <LoginScreen onLogin={() => {
      fetchCities()
        .then(({ cities }) => { setAuthed(true); setCities(cities); })
        .catch(() => setAuthed(true));
    }} />
  );

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/"      element={<SearchPage cities={cities} />} />
        <Route path="/map"   element={<MapPage />} />
        <Route path="*"      element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
