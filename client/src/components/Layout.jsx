import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ReportSpot from './ReportSpot.jsx';
import { IconSearch, IconNavigation, IconCar, IconPlus } from '../icons.jsx';

export default function Layout({ children, mapMode = false }) {
  const navigate     = useNavigate();
  const { pathname } = useLocation();
  const [reportOpen, setReportOpen] = useState(false);

  const tabs = [
    { path: '/',     label: 'חיפוש', Icon: IconSearch },
    { path: '/map',  label: 'מפה',   Icon: IconNavigation },
    { path: '/ride', label: 'בדרך',  Icon: IconCar },
  ];

  return (
    <div style={s.root}>
      <header style={s.header}>
        <span style={s.logo}>
          טרמפ<span style={s.logoAccent}>יט</span>
        </span>
        <span style={s.badge}>v0.2 BETA</span>
      </header>

      <nav style={s.tabbar}>
        {tabs.map(({ path, label, Icon }) => {
          const active = pathname === path;
          return (
            <button
              key={path}
              style={s.tabbarBtn}
              onClick={() => navigate(path)}
            >
              <span style={{ ...s.tabbarIconWrap, ...(active ? s.tabbarIconWrapActive : {}) }}>
                <Icon size={20} style={{ color: active ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }} />
              </span>
              <span style={{ ...s.tabbarLabel, ...(active ? s.tabbarLabelActive : {}) }}>{label}</span>
            </button>
          );
        })}
      </nav>

      <main style={{ ...s.content, overflow: mapMode ? 'hidden' : 'auto' }}>
        {children}
      </main>

      <button style={s.fab} onClick={() => setReportOpen(true)}>
        <IconPlus size={22} />
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

const TABBAR_HEIGHT = 62;

const s = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: 'var(--background)', color: 'var(--foreground)', direction: 'rtl',
    fontFamily: 'var(--font-body)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 24px 10px', height: 48,
    background: 'var(--background)',
    flexShrink: 0,
    paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))',
  },
  logo: {
    fontFamily: 'var(--font-heading)',
    fontSize: 19, fontWeight: 800, color: 'var(--foreground)',
    letterSpacing: '-0.02em', lineHeight: 1,
  },
  logoAccent: { color: 'var(--primary)' },
  badge: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)',
    background: 'var(--muted)', border: '1px solid var(--border)',
    padding: '3px 9px', borderRadius: 999, letterSpacing: '0.03em',
  },

  content: {
    flex: 1, overflowY: 'auto',
    display: 'flex', flexDirection: 'column',
  },

  fab: {
    position: 'absolute', bottom: 20, left: 16,
    background: 'var(--accent)', border: 'none',
    borderRadius: '50%', width: 52, height: 52, padding: 0,
    color: 'var(--accent-foreground)',
    cursor: 'pointer',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 0.15s',
  },

  tabbar: {
    flexShrink: 0, zIndex: 90,
    height: TABBAR_HEIGHT,
    background: 'var(--card)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
  },
  tabbarBtn: {
    flex: 1, background: 'none', border: 'none', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 3, fontFamily: 'var(--font-body)',
  },
  tabbarIconWrap: {
    width: 34, height: 26, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s',
  },
  tabbarIconWrapActive: {
    background: 'var(--primary)',
  },
  tabbarLabel: {
    fontSize: 10.5, fontWeight: 600, color: 'var(--muted-foreground)',
  },
  tabbarLabelActive: {
    color: 'var(--foreground)', fontWeight: 700,
  },
};
