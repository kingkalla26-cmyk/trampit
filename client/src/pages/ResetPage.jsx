import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IconRoute } from '../icons.jsx';

export default function ResetPage() {
  const [params]  = useSearchParams();
  const navigate  = useNavigate();
  const token     = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 6)    { setError('הסיסמה צריכה להיות לפחות 6 תווים'); return; }
    if (password !== confirm)   { setError('הסיסמאות לא תואמות'); return; }

    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error || 'שגיאה — נסה שוב'); return; }
      setDone(true);
      setTimeout(() => { window.location.href = '/'; }, 1500);
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

        {done ? (
          <>
            <div style={s.sub}>הסיסמה עודכנה! ✓</div>
            <div style={s.doneMsg}>מעביר אותך לאפליקציה...</div>
          </>
        ) : !token ? (
          <>
            <div style={s.sub}>קישור לא תקין</div>
            <div style={s.doneMsg}>הקישור חסר או פגום — בקש איפוס חדש ממסך ההתחברות.</div>
            <button style={s.btn} onClick={() => navigate('/')}>למסך ההתחברות</button>
          </>
        ) : (
          <>
            <div style={s.sub}>בחר סיסמה חדשה</div>
            <form onSubmit={handleSubmit} style={s.form}>
              <input
                style={s.input}
                type="password"
                placeholder="סיסמה חדשה (לפחות 6 תווים)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
              />
              <input
                style={s.input}
                type="password"
                placeholder="אימות סיסמה"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
              {error && <div style={s.error}>{error}</div>}
              <button style={{ ...s.btn, opacity: loading ? 0.6 : 1 }} type="submit" disabled={loading}>
                {loading ? 'מעדכן...' : 'עדכן סיסמה →'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  root:  { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--muted)', padding: 16 },
  card:  { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 20, padding: '36px 28px', width: '100%', maxWidth: 360, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },
  logo:  { fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--foreground)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sub:   { fontSize: 15, fontWeight: 700, color: 'var(--foreground)', marginBottom: 16 },
  doneMsg: { fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 16, lineHeight: 1.6 },
  form:  { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', color: 'var(--foreground)', fontSize: 16, fontFamily: 'var(--font-body)', outline: 'none', direction: 'rtl', textAlign: 'right' },
  error: { color: 'var(--destructive)', fontSize: 13 },
  btn:   { background: 'var(--primary)', border: 'none', borderRadius: 10, padding: '14px', color: 'var(--primary-foreground)', fontSize: 15.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-heading)', width: '100%' },
};
