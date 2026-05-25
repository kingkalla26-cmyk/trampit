import { useState, useEffect } from 'react';
import Home          from './pages/Home.jsx';
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
      <Home cities={cities} />
    </ErrorBoundary>
  );
}
