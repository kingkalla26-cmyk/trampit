import { useState, useEffect } from 'react';
import Layout from '../components/Layout.jsx';
import { IconSearch, IconPin, IconCar, IconClock, IconChevronDown, IconChevronUp, IconRefresh, IconAlertCircle } from '../icons.jsx';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminPage() {
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState({}); // email → bool

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/overview', { credentials: 'include' });
      if (res.status === 403 || res.status === 401) {
        setError('אין הרשאה — העמוד מיועד למנהל בלבד. ודא שאתה מחובר עם חשבון המנהל.');
        return;
      }
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'שגיאה בטעינה'); return; }
      setData(d);
    } catch {
      setError('שגיאת חיבור — נסה שוב');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <Layout>
      <div style={s.page}>

        <div style={s.header}>
          <div>
            <div style={s.title}>עמוד ניהול</div>
            <div style={s.sub}>משתמשים רשומים והחיפושים שלהם</div>
          </div>
          <button style={s.refreshBtn} onClick={load} disabled={loading}>
            <IconRefresh size={14} /> רענן
          </button>
        </div>

        {error && (
          <div style={s.errorBox}>
            <IconAlertCircle size={18} style={{ color: 'var(--destructive)', flexShrink: 0 }} />
            {error}
          </div>
        )}

        {loading && !data && <div style={s.loading}>טוען נתונים...</div>}

        {data && (
          <>
            {/* סיכום */}
            <div style={s.statsRow}>
              <div style={s.statCard}>
                <div style={s.statNum}>{data.totalUsers}</div>
                <div style={s.statLabel}>משתמשים רשומים</div>
              </div>
              <div style={s.statCard}>
                <div style={s.statNum}>{data.totalSearches}</div>
                <div style={s.statLabel}>חיפושים סה"כ</div>
              </div>
            </div>

            {/* רשימת משתמשים */}
            {data.users.length === 0 && (
              <div style={s.loading}>אין עדיין משתמשים רשומים</div>
            )}

            {data.users.map(u => {
              const isOpen = open[u.email];
              return (
                <div key={u.email} style={s.userCard}>
                  <button style={s.userTop} onClick={() => setOpen(p => ({ ...p, [u.email]: !p[u.email] }))}>
                    <div style={s.userInfo}>
                      <div style={s.userName}>{u.username}</div>
                      <div style={s.userEmail}>{u.email}</div>
                      <div style={s.userMeta}>
                        <IconClock size={11} style={{ display: 'inline', verticalAlign: '-2px' }} /> נרשם: {fmtDate(u.createdAt)}
                      </div>
                    </div>
                    <div style={s.userLeft}>
                      <span style={s.searchBadge}>
                        <IconSearch size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> {u.searchCount}
                      </span>
                      {u.searchCount > 0 && (isOpen ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />)}
                    </div>
                  </button>

                  {isOpen && u.searches.length > 0 && (
                    <div style={s.searchList}>
                      {u.searches.map((q, i) => (
                        <div key={i} style={s.searchRow}>
                          <div style={s.searchMain}>
                            {q.type === 'plan' ? (
                              <><IconCar size={12} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} /> ברכב ליעד: <b>{q.destination}</b></>
                            ) : (
                              <><IconPin size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} /> <b>{q.origin}</b> ← <b>{q.destination}</b>
                                {q.carDest && <span style={s.searchCar}> · רכב ל{q.carDest}</span>}</>
                            )}
                          </div>
                          <div style={s.searchTime}>{fmtDate(q.ts)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

      </div>
    </Layout>
  );
}

const s = {
  page:   { padding: '16px 16px 80px', display: 'flex', flexDirection: 'column', gap: 12 },

  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title:  { fontFamily: 'var(--font-heading)', fontSize: 19, fontWeight: 800, color: 'var(--foreground)' },
  sub:    { fontSize: 12.5, color: 'var(--muted-foreground)', marginTop: 3 },
  refreshBtn: {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '8px 14px', fontSize: 13, fontWeight: 700, color: 'var(--muted-foreground)',
    cursor: 'pointer', fontFamily: 'var(--font-body)',
    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
  },

  errorBox: {
    background: 'rgba(var(--destructive-rgb),0.06)', border: '1px solid rgba(var(--destructive-rgb),0.25)',
    borderRadius: 10, padding: '12px 14px', color: 'var(--destructive)', fontSize: 13.5,
    display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.5,
  },
  loading: { color: 'var(--muted-foreground)', fontSize: 13, textAlign: 'center', padding: '20px 0' },

  statsRow: { display: 'flex', gap: 10 },
  statCard: {
    flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
    padding: '14px 16px', textAlign: 'center',
  },
  statNum:   { fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 500, color: 'var(--primary)', lineHeight: 1.1 },
  statLabel: { fontSize: 11.5, color: 'var(--muted-foreground)', fontWeight: 600, marginTop: 4 },

  userCard: {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
    overflow: 'hidden',
  },
  userTop: {
    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    padding: '13px 16px', textAlign: 'right', fontFamily: 'var(--font-body)',
  },
  userInfo:  { minWidth: 0 },
  userName:  { fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 700, color: 'var(--foreground)' },
  userEmail: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted-foreground)', direction: 'ltr', textAlign: 'right', marginTop: 2 },
  userMeta:  { fontSize: 11, color: 'var(--muted-foreground)', marginTop: 3 },
  userLeft:  { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, color: 'var(--muted-foreground)' },
  searchBadge: {
    background: 'rgba(var(--primary-rgb),0.08)', border: '1px solid rgba(var(--primary-rgb),0.3)',
    color: 'var(--primary)', borderRadius: 999, padding: '3px 10px',
    fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4,
  },

  searchList: { borderTop: '1px solid var(--muted)', padding: '6px 16px 12px', display: 'flex', flexDirection: 'column', gap: 4 },
  searchRow:  {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    padding: '7px 0', borderBottom: '1px solid var(--muted)',
  },
  searchMain: { fontSize: 13, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 },
  searchCar:  { fontSize: 12, color: 'var(--muted-foreground)' },
  searchTime: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted-foreground)', flexShrink: 0 },
};
