import { useEffect, useState } from 'react';

function Dots() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setCount(c => (c % 3) + 1), 480);
    return () => clearInterval(id);
  }, []);
  return <span aria-hidden="true">{'•'.repeat(count)}</span>;
}

export default function SplashScreen({ fading = false, message = 'מתחבר לשרת...' }) {
  return (
    <div style={{ ...s.root, opacity: fading ? 0 : 1 }}>

      <div style={s.iconWrap}>
        <div style={s.iconPulse} />
        <div style={s.icon}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--primary-foreground)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11" />
          </svg>
        </div>
      </div>

      <div style={s.brand}>
        טרמפ<span style={s.brandAccent}>יט</span>
      </div>
      <div style={s.tagline}>ניווט חכם לטרמפיסטים</div>

      <div style={s.bottomBlock}>
        <div style={s.spinner} />
        <div style={s.msg}>
          {message}&nbsp;<Dots />
        </div>
      </div>

      <style>{`
        @keyframes trampit-spin { to { transform: rotate(360deg); } }
        @keyframes trampit-pulse {
          0%, 100% { transform: scale(1);   opacity: 0.3; }
          50%       { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

const s = {
  root: {
    position: 'absolute', inset: 0, zIndex: 9999,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: 'var(--background)',
    fontFamily: 'var(--font-body)',
    gap: 0,
    transition: 'opacity 0.55s ease',
    userSelect: 'none',
    direction: 'rtl',
  },

  iconWrap: {
    position: 'relative',
    width: 96, height: 96,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  iconPulse: {
    position: 'absolute', inset: 0,
    borderRadius: '30px',
    background: 'var(--primary)',
    opacity: 0.2,
    animation: 'trampit-pulse 2s ease-in-out infinite',
  },
  icon: {
    width: 80, height: 80,
    borderRadius: '26px',
    background: 'var(--primary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 12px 32px rgba(var(--primary-rgb),0.28)',
  },

  brand: {
    fontFamily: 'var(--font-heading)',
    fontSize: 34,
    fontWeight: 800,
    color: 'var(--foreground)',
    letterSpacing: '-0.02em',
    lineHeight: 1,
    marginBottom: 6,
  },
  brandAccent: { color: 'var(--primary)' },
  tagline: {
    fontSize: 13,
    color: 'var(--muted-foreground)',
    fontWeight: 500,
    marginBottom: 56,
  },

  bottomBlock: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
  },
  spinner: {
    width: 26, height: 26,
    border: '2.5px solid var(--border)',
    borderTop: '2.5px solid var(--primary)',
    borderRadius: '50%',
    animation: 'trampit-spin 0.75s linear infinite',
  },
  msg: {
    fontSize: 13,
    color: 'var(--muted-foreground)',
    fontWeight: 500,
    minWidth: 160,
    textAlign: 'center',
  },
};
