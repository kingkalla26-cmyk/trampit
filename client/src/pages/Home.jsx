import { useState } from 'react';
import MapComponent from '../components/MapComponent.jsx';
import SearchForm   from '../components/SearchForm.jsx';
import Results      from '../components/Results.jsx';
import { useAnalyze } from '../hooks/useAnalyze.js';

const INITIAL_FORM = {
  origin: '', destination: '', carDest: '',
  travelTime: 'now', wazeLink: null, wazeLinkInput: '',
  wazeLinkStatus: '', uploadedImage: null, imagePreview: null,
};

export default function Home({ cities = [] }) {
  const [tab,  setTab]  = useState('search');
  const [form, setForm] = useState(INITIAL_FORM);
  const [toast, setToast] = useState('');
  const { loading, results, apiError, analyze, reset } = useAnalyze();

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleAnalyze() {
    if (!form.origin || !form.destination) { showToast('⚠️ נא למלא נקודת מוצא ויעד'); return; }
    if (!form.carDest)                     { showToast('⚠️ נא לציין לאן נוסע הרכב');  return; }
    await analyze(form);
  }

  function handleReset() {
    reset();
    setForm(INITIAL_FORM);
  }

  return (
    <div style={s.root}>
      <header style={s.header}>
        <span style={s.logo}>🛣 טרמפ<span style={{ color: '#4f9eff' }}>יט</span></span>
        <span style={s.badge}>v0.2 · BETA</span>
      </header>

      <div style={s.tabs}>
        <button style={{ ...s.tab, ...(tab === 'search' ? s.tabActive : {}) }} onClick={() => setTab('search')}>🔍 חיפוש</button>
        <button style={{ ...s.tab, ...(tab === 'map'    ? s.tabActive : {}) }} onClick={() => setTab('map')}>🗺 מפה</button>
      </div>

      <div style={s.content}>
        {tab === 'search' && !results && (
          <>
            <SearchForm form={form} setForm={setForm} onAnalyze={handleAnalyze} loading={loading} cities={cities} />
            {apiError && (
              <div style={s.errorBox}>
                <div style={s.errorIcon}>⚠️</div>
                <div>
                  <div style={s.errorTitle}>שגיאה בניתוח</div>
                  <div style={s.errorMsg}>{apiError}</div>
                </div>
              </div>
            )}
          </>
        )}
        {tab === 'search' && results && <Results {...results} onReset={handleReset} />}
        {tab === 'map' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <MapComponent />
          </div>
        )}
      </div>

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}

const s = {
  root:       { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d0f14', color: '#f0f2f7', direction: 'rtl' },
  header:     { display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', height: 56, background: 'rgba(13,15,20,0.95)', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 },
  logo:       { fontSize: 20, fontWeight: 700 },
  badge:      { fontSize: 10, fontWeight: 700, color: '#4f9eff', background: 'rgba(79,158,255,0.1)', border: '1px solid rgba(79,158,255,0.25)', padding: '2px 8px', borderRadius: 20 },
  tabs:       { display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 },
  tab:        { flex: 1, padding: '12px 0', background: 'none', border: 'none', color: '#7a8499', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Heebo, sans-serif', transition: 'color 0.2s' },
  tabActive:  { color: '#4f9eff', borderBottom: '2px solid #4f9eff' },
  content:    { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  toast:      { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1e2330', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 20px', fontSize: 14, color: '#f0f2f7', zIndex: 9999, whiteSpace: 'nowrap' },
  errorBox:   { margin: '0 16px 16px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 12, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start' },
  errorIcon:  { fontSize: 20, flexShrink: 0 },
  errorTitle: { fontSize: 14, fontWeight: 700, color: '#f87171', marginBottom: 4 },
  errorMsg:   { fontSize: 13, color: '#fca5a5', lineHeight: 1.5 },
};
