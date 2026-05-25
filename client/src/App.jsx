import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SearchPage    from './pages/SearchPage.jsx';
import MapPage       from './pages/MapPage.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

export default function App() {
  const [cities, setCities] = useState([]);

  useEffect(() => {
    fetch('/api/cities', { credentials: 'include' })
      .then(r => r.json())
      .then(d => Array.isArray(d) && setCities(d))
      .catch(() => {});
  }, []);

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/"    element={<SearchPage cities={cities} />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="*"    element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
