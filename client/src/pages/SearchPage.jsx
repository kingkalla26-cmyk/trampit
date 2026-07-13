import { useState } from 'react';
import Layout        from '../components/Layout.jsx';
import SearchForm    from '../components/SearchForm.jsx';
import RouteOptions  from '../components/RouteOptions.jsx';
import Results       from '../components/Results.jsx';
import { useAnalyze } from '../hooks/useAnalyze.js';

const INITIAL_FORM = { origin: '', destination: '', carDest: '' };

export default function SearchPage({ cities = [] }) {
  const [form,         setForm]         = useState(INITIAL_FORM);
  const [toast,        setToast]        = useState('');
  const [routeOptions, setRouteOptions] = useState(null);   // מערך נתיבים לבחירה
  const [routeLoading, setRouteLoading] = useState(false);  // טעינת אופציות
  const [routeError,   setRouteError]   = useState('');
  const { loading, results, apiError, analyze, reset } = useAnalyze();

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  // שלב א׳ — שליפת אופציות המסלול
  async function handleAnalyze() {
    if (!form.origin || !form.destination) { showToast('⚠️ נא למלא נקודת מוצא ויעד'); return; }
    if (!form.carDest) { showToast('⚠️ הזן את יעד הרכב'); return; }

    setRouteLoading(true);
    setRouteError('');
    setRouteOptions(null);
    try {
      const params = new URLSearchParams({ origin: form.origin, carDest: form.carDest });
      const res  = await fetch(`/api/route/options?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) { setRouteError(data.error || 'שגיאה בטעינת מסלולים'); return; }
      if (!data.routes?.length) { setRouteError('לא נמצאו מסלולים — בדוק את הכתובות'); return; }
      if (data.routes.length === 1) { await analyze(form, 0); return; }
      setRouteOptions(data.routes);
    } catch {
      setRouteError('שגיאת רשת — נסה שוב');
    } finally {
      setRouteLoading(false);
    }
  }

  // שלב ב׳ — המשתמש בחר נתיב
  async function handleRouteSelect(routeIndex) {
    await analyze(form, routeIndex);
  }

  function handleReset() {
    reset();
    setForm(INITIAL_FORM);
    setRouteOptions(null);
    setRouteError('');
  }

  return (
    <Layout>
      {!results && !routeOptions && (
        <>
          <SearchForm
            form={form} setForm={setForm}
            onAnalyze={handleAnalyze}
            loading={routeLoading || loading}
            cities={cities}
          />
          {(routeError || apiError) && (
            <div style={s.errorBox}>
              <div style={s.errorIcon}>⚠️</div>
              <div>
                <div style={s.errorTitle}>שגיאה</div>
                <div style={s.errorMsg}>{routeError || apiError}</div>
              </div>
            </div>
          )}
        </>
      )}

      {routeOptions && !results && (
        <>
          <div style={s.backRow}>
            <button style={s.backBtn} onClick={handleReset}>← חזרה</button>
          </div>
          <RouteOptions
            routes={routeOptions}
            onSelect={handleRouteSelect}
            loading={loading}
          />
          {apiError && (
            <div style={{ ...s.errorBox, margin: '0 16px' }}>
              <div style={s.errorIcon}>⚠️</div>
              <div><div style={s.errorMsg}>{apiError}</div></div>
            </div>
          )}
        </>
      )}

      {results && <Results {...results} onReset={handleReset} />}
      {toast && <div style={s.toast}>{toast}</div>}
    </Layout>
  );
}

const s = {
  errorBox:   { margin: '0 16px 16px', background: 'rgba(var(--destructive-rgb),0.06)', border: '1px solid rgba(var(--destructive-rgb),0.25)', borderRadius: 12, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start' },
  errorIcon:  { fontSize: 20, flexShrink: 0 },
  errorTitle: { fontSize: 14, fontWeight: 700, color: 'var(--destructive)', marginBottom: 4 },
  errorMsg:   { fontSize: 13, color: 'var(--destructive)', lineHeight: 1.5 },
  backRow:    { padding: '12px 16px 0' },
  backBtn:    { background: 'none', border: 'none', color: 'var(--muted-foreground)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)', padding: 0 },
  toast:      { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--foreground)', border: '1px solid var(--foreground)', borderRadius: 10, padding: '12px 20px', fontSize: 14, color: 'var(--muted)', zIndex: 9999, whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' },
};
