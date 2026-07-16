import { useState } from 'react';
import { IconRoute } from '../icons.jsx';

export default function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState('register'); // 'register' | 'login'
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const isRegister = mode === 'register';

  function switchMode(m) {
    setMode(m);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.email.trim() || !form.password) { setError('נא למלא אימייל וסיסמה'); return; }
    if (isRegister && !form.username.trim())  { setError('נא למלא שם משתמש'); return; }
    if (isRegister && form.password.length < 6) { setError('הסיסמה צריכה להיות לפחות 6 תווים'); return; }

    setLoading(true);
    setError('');
    try {
      const body = isRegister
        ? { email: form.email.trim(), username: form.username.trim(), password: form.password }
        : { email: form.email.trim(), password: form.password };
      const res  = await fetch(isRegister ? '/api/register' : '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'שגיאה — נסה שוב');
        return;
      }
      onLogin();
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
        <div style={s.sub}>
          {isRegister ? 'צור חשבון חינם והתחל לנווט' : 'ברוך שובך!'}
        </div>

        {/* מתג הרשמה / התחברות */}
        <div style={s.tabs}>
          <button
            type="button"
            style={{ ...s.tab, ...(isRegister ? s.tabActive : {}) }}
            onClick={() => switchMode('register')}
          >
            הרשמה
          </button>
          <button
            type="button"
            style={{ ...s.tab, ...(!isRegister ? s.tabActive : {}) }}
            onClick={() => switchMode('login')}
          >
            התחברות
          </button>
        </div>

        <form onSubmit={handleSubmit} style={s.form}>
          {isRegister && (
            <input
              style={s.input}
              type="text"
              placeholder="שם משתמש"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              autoComplete="nickname"
              maxLength={30}
            />
          )}
          <input
            style={s.input}
            type="email"
            placeholder="אימייל"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            autoComplete="email"
            dir="ltr"
            autoFocus
          />
          <input
            style={s.input}
            type="password"
            placeholder={isRegister ? 'סיסמה (לפחות 6 תווים)' : 'סיסמה'}
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />

          {error && <div style={s.error}>{error}</div>}

          <button style={{ ...s.btn, opacity: loading ? 0.6 : 1 }} type="submit" disabled={loading}>
            {loading
              ? (isRegister ? 'יוצר חשבון...' : 'מתחבר...')
              : (isRegister ? 'צור חשבון →' : 'כניסה →')}
          </button>
        </form>

        {isRegister && (
          <div style={s.consent}>
            בהרשמה אתה מאשר שמירת הפרטים לצורך שימוש באפליקציה ועדכונים.
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  root:  { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--muted)', padding: 16 },
  card:  { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 20, padding: '36px 28px', width: '100%', maxWidth: 360, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },
  logo:  { fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--foreground)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sub:   { fontSize: 14, color: 'var(--muted-foreground)', marginBottom: 20 },

  tabs: {
    display: 'flex', background: 'var(--muted)', borderRadius: 12, padding: 4, marginBottom: 18, gap: 4,
  },
  tab: {
    flex: 1, background: 'none', border: 'none', borderRadius: 9,
    padding: '9px 0', fontSize: 14, fontWeight: 600, color: 'var(--muted-foreground)',
    cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'background 0.15s, color 0.15s',
  },
  tabActive: {
    background: 'var(--card)', color: 'var(--primary)', fontWeight: 700,
    boxShadow: '0 1px 4px rgba(28,25,23,0.08)',
  },

  form:  { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', color: 'var(--foreground)', fontSize: 16, fontFamily: 'var(--font-body)', outline: 'none', direction: 'rtl', textAlign: 'right' },
  error: { color: 'var(--destructive)', fontSize: 13 },
  btn:   { background: 'var(--primary)', border: 'none', borderRadius: 10, padding: '14px', color: 'var(--primary-foreground)', fontSize: 15.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-heading)' },

  consent: { fontSize: 11, color: 'var(--muted-foreground)', marginTop: 14, lineHeight: 1.5 },
};
