import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ReportSpot from './ReportSpot.jsx';

export default function Layout({ children }) {
  const navigate     = useNavigate();
  const { pathname } = useLocation();
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div style={s.root}>
      <header style={s.header}>
        <span style={s.logo}>🛣 טרמפ<span style={{ color: '#2563eb' }}>יט</span></span>
        <span style={s.badge}>v0.2 · BETA</span>
      </header>

      <nav style={s.tabs}>
        <button
          style={{ ...s.tab, ...(pathname === '/'     ? s.tabActive : {}) }}
          onClick={() => navigate('/')}
        >🔍 חיפוש</button>
        <button
          style={{ ...s.tab, ...(pathname === '/map'  ? s.tabActive : {}) }}
          onClick={() => navigate('/map')}
        >🗺 מפה</button>
        <button
          style={{ ...s.tab, ...(pathname === '/ride' ? s.tabActive : {}) }}
          onClick={() => navigate('/ride')}
        >🚗 בדרך</button>
      </nav>

      <main style={s.content}>
        {children}
      </main>

      <button style={s.fab} onClick={() => setReportOpen(true)}>
        📍 דווח טרמפ
      </button>

      {reportOpen && (
        <ReportSpot
          onClose={() => setReportOpen(false)}
          onSuccess={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}

const s = {
  root:      { display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc', color: '#1f2937', direction: 'rtl' },
  header:    { display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', height: 56, background: 'rgba(255,255,255,0.98)', borderBottom: '1px solid #e5e7eb', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  logo:      { fontSize: 20, fontWeight: 700, color: '#1f2937' },
  badge:     { fontSize: 10, fontWeight: 700, color: '#2563eb', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)', padding: '2px 8px', borderRadius: 20 },
  tabs:      { display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#ffffff', flexShrink: 0 },
  tab:       { flex: 1, padding: '12px 0', background: 'none', border: 'none', color: '#6b7280', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Heebo, sans-serif', transition: 'color 0.2s' },
  tabActive: { color: '#2563eb', borderBottom: '2px solid #2563eb' },
  content:   { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  fab:       { position: 'fixed', bottom: 24, left: 20, background: '#2563eb', border: 'none', borderRadius: 24, padding: '12px 18px', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Heebo, sans-serif', boxShadow: '0 4px 14px rgba(37,99,235,0.4)', zIndex: 100 },
};
