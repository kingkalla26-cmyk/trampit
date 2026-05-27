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
        <div style={s.logo}>🛣 טרמפ<span style={{ color: '#2563eb' }}>יט</span></div>
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
  root:  { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f3f4f6' },
  card:  { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, padding: '40px 32px', width: '100%', maxWidth: 360, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },
  logo:  { fontSize: 28, fontWeight: 700, color: '#1f2937', marginBottom: 8 },
  sub:   { fontSize: 14, color: '#4b5563', marginBottom: 28 },
  form:  { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { background: '#f9fafb', border: '1px solid #d1d5db', borderRadius: 10, padding: '14px 16px', color: '#1f2937', fontSize: 16, fontFamily: 'Heebo, sans-serif', outline: 'none', direction: 'rtl', textAlign: 'right' },
  error: { color: '#dc2626', fontSize: 13 },
  btn:   { background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', border: 'none', borderRadius: 10, padding: '14px', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'Heebo, sans-serif' },
};
