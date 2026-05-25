import { useState } from 'react';

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
        <div style={s.logo}>🛣 טרמפ<span style={{ color: '#4f9eff' }}>יט</span></div>
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
  root:  { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d0f14' },
  card:  { background: '#161a22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '40px 32px', width: '100%', maxWidth: 360, textAlign: 'center' },
  logo:  { fontSize: 28, fontWeight: 700, color: '#f0f2f7', marginBottom: 8 },
  sub:   { fontSize: 14, color: '#7a8499', marginBottom: 28 },
  form:  { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { background: '#1e2330', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '14px 16px', color: '#f0f2f7', fontSize: 16, fontFamily: 'Heebo, sans-serif', outline: 'none', direction: 'rtl', textAlign: 'right' },
  error: { color: '#f87171', fontSize: 13 },
  btn:   { background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', border: 'none', borderRadius: 10, padding: '14px', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'Heebo, sans-serif' },
};
