import { useNavigate, useLocation } from 'react-router-dom';

export default function Layout({ children }) {
  const navigate  = useNavigate();
  const { pathname } = useLocation();

  return (
    <div style={s.root}>
      <header style={s.header}>
        <span style={s.logo}>🛣 טרמפ<span style={{ color: '#4f9eff' }}>יט</span></span>
        <span style={s.badge}>v0.2 · BETA</span>
      </header>

      <nav style={s.tabs}>
        <button
          style={{ ...s.tab, ...(pathname === '/'    ? s.tabActive : {}) }}
          onClick={() => navigate('/')}
        >🔍 חיפוש</button>
        <button
          style={{ ...s.tab, ...(pathname === '/map' ? s.tabActive : {}) }}
          onClick={() => navigate('/map')}
        >🗺 מפה</button>
      </nav>

      <main style={s.content}>
        {children}
      </main>
    </div>
  );
}

const s = {
  root:      { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d0f14', color: '#f0f2f7', direction: 'rtl' },
  header:    { display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', height: 56, background: 'rgba(13,15,20,0.95)', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 },
  logo:      { fontSize: 20, fontWeight: 700 },
  badge:     { fontSize: 10, fontWeight: 700, color: '#4f9eff', background: 'rgba(79,158,255,0.1)', border: '1px solid rgba(79,158,255,0.25)', padding: '2px 8px', borderRadius: 20 },
  tabs:      { display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 },
  tab:       { flex: 1, padding: '12px 0', background: 'none', border: 'none', color: '#7a8499', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Heebo, sans-serif', transition: 'color 0.2s' },
  tabActive: { color: '#4f9eff', borderBottom: '2px solid #4f9eff' },
  content:   { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' },
};
