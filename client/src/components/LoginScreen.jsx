import { useState } from 'react';
import { IconRoute } from '../icons.jsx';

export default function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        onLogin();
      } else {
        setError(data.error || 'סיסמה שגויה');
      }
    } catch {
      setError('שגיאת חיבור — נסה שוב');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.root}>
      <div style={s.card}>
        <div style={s.logo}>
          <IconRoute size={26} style={{ color: 'var(--primary)' }} />
          טרמפ<span style={{ color: 'var(--primary)' }}>יט</span>
        </div>
        <div style={s.sub}>הזן סיסמה להמשך</div>

        <form onSubmit={handleSubmit} style={s.form}>
          <input
            style={s.input}
            type="password"
            placeholder="סיסמה"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
          {error && <div style={s.error}>{error}</div>}
          <button style={{ ...s.btn, opacity: loading ? 0.6 : 1 }} type="submit" disabled={loading}>
            {loading ? 'מתחבר...' : 'כניסה →'}
          </button>
        </form>
      </div>
    </div>
  );
}

const s = {
  root:  { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--muted)' },
  card:  { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 20, padding: '40px 32px', width: '100%', maxWidth: 360, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },
  logo:  { fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--foreground)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sub:   { fontSize: 14, color: 'var(--muted-foreground)', marginBottom: 28 },
  form:  { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', color: 'var(--foreground)', fontSize: 16, fontFamily: 'var(--font-body)', outline: 'none', direction: 'rtl', textAlign: 'right' },
  error: { color: 'var(--destructive)', fontSize: 13 },
  btn:   { background: 'var(--primary)', border: 'none', borderRadius: 10, padding: '14px', color: 'var(--primary-foreground)', fontSize: 15.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-heading)' },
};
