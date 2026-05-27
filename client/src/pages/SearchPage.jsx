import { useState } from 'react';
import Layout      from '../components/Layout.jsx';
import SearchForm  from '../components/SearchForm.jsx';
import Results     from '../components/Results.jsx';
import { useAnalyze } from '../hooks/useAnalyze.js';

const INITIAL_FORM = {
  origin: '', destination: '', carDest: '',
  travelTime: 'now', wazeLink: null, wazeLinkInput: '',
  wazeLinkStatus: '', uploadedImage: null, imagePreview: null,
};

export default function SearchPage({ cities = [] }) {
  const [form,  setForm]  = useState(INITIAL_FORM);
  const [toast, setToast] = useState('');
  const { loading, results, apiError, analyze, reset } = useAnalyze();

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleAnalyze() {
    if (!form.origin || !form.destination) { showToast('⚠️ נא למלא נקודת מוצא ויעד'); return; }
    if (!form.carDest && !form.wazeLink && !form.uploadedImage) {
      showToast('⚠️ הזן יעד רכב, קישור Waze, או צילום מסך');
      return;
    }
    await analyze(form);
  }

  function handleReset() {
    reset();
    setForm(INITIAL_FORM);
  }

  return (
    <Layout>
      {!results && (
        <>
          <SearchForm
            form={form} setForm={setForm}
            onAnalyze={handleAnalyze} loading={loading}
            cities={cities}
          />
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
      {results && <Results {...results} onReset={handleReset} />}
      {toast && <div style={s.toast}>{toast}</div>}
    </Layout>
  );
}

const s = {
  errorBox:   { margin: '0 16px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start' },
  errorIcon:  { fontSize: 20, flexShrink: 0 },
  errorTitle: { fontSize: 14, fontWeight: 700, color: '#dc2626', marginBottom: 4 },
  errorMsg:   { fontSize: 13, color: '#ef4444', lineHeight: 1.5 },
  toast:      { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1f2937', border: '1px solid #374151', borderRadius: 10, padding: '12px 20px', fontSize: 14, color: '#f9fafb', zIndex: 9999, whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' },
};
