import { useState } from 'react';
import MapComponent from '../components/MapComponent.jsx';
import SearchForm from '../components/SearchForm.jsx';
import Results from '../components/Results.jsx';

const INITIAL_FORM = {
  origin: '', destination: '', carDest: '',
  travelTime: 'now', wazeLink: null, wazeLinkInput: '',
  wazeLinkStatus: '', uploadedImage: null, imagePreview: null,
};

export default function Home() {
  const [tab, setTab] = useState('search');
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [toast, setToast] = useState('');
  const [apiError, setApiError] = useState('');

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleAnalyze() {
    if (!form.origin || !form.destination) { showToast('⚠️ נא למלא נקודת מוצא ויעד'); return; }
    if (!form.carDest) { showToast('⚠️ נא לציין לאן נוסע הרכב'); return; }

    setLoading(true);
    setResults(null);
    setApiError('');

    const timeLabel = { now: 'עכשיו', morning: 'בוקר', noon: 'צהריים', afternoon: 'אחה"צ', evening: 'ערב' }[form.travelTime];

    const userContent = [];
    if (form.uploadedImage) {
      userContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: form.uploadedImage } });
      userContent.push({ type: 'text', text: 'זה צילום מסך מ-Waze של מסלול הנסיעה.' });
    }
    userContent.push({
      type: 'text',
      text: `אני צריך לנסוע מ-${form.origin} ל-${form.destination}.
עלה לי טרמפ ברכב שנוסע ל-${form.carDest}.
שעת הנסיעה: ${timeLabel}.
${form.uploadedImage ? 'ראה בתמונה את המסלול של הרכב.' : ''}
${form.wazeLink ? 'קישור המסלול של הנהג: ' + form.wazeLink : ''}

אנא נתח ותן לי 3 אפשרויות יציאה אופטימליות מהרכב, כולל:
- שם הצומת/תחנה לרדת
- המשך הנסיעה משם (אוטובוס/רכבת/טרמפ)
- זמן משוער, עלות משוערת
- האם יש שם נקודת טרמפ פעילה

וגם: רשימת 3 נקודות טרמפ חמות ידועות לאורך המסלול.

ענה רק בJSON הזה, ללא שום טקסט מחוץ ל-JSON:
{
  "options": [
    {
      "type": "fast|cheap|tramp",
      "location": "שם הצומת",
      "exitDistance": "ק\\"מ מנקודת המוצא",
      "time": "זמן משוער ל${form.destination}",
      "cost": "עלות משוערת",
      "transport": ["אוטובוס 480"],
      "trampScore": 8,
      "note": "הערה קצרה",
      "best": true
    }
  ],
  "hotspots": [
    { "name": "שם הנקודה", "direction": "לאן מקבלים טרמפ", "heat": 4, "bestTime": "שעות פעיל" }
  ],
  "aiInsight": "תובנה קצרה על המסלול"
}`
    });

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: userContent }] }),
      });
      const data = await res.json();

      if (data.error) {
        setApiError(data.error);
        return;
      }

      const text = (data.content || []).map(b => b.text || '').join('');
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean.substring(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
      setResults({ data: parsed, origin: form.origin, destination: form.destination, carDest: form.carDest });
      setTab('search');
    } catch (err) {
      console.error(err);
      const msg = err?.message || '';
      if (msg.includes('מכסת') || msg.includes('429')) {
        setApiError('מכסת ה-API מלאה — נסה שוב מחר או החלף מפתח Gemini.');
      } else if (msg.includes('timeout') || msg.includes('abort')) {
        setApiError('השרת לא הגיב בזמן — בדוק את החיבור ונסה שוב.');
      } else {
        setApiError('שגיאה בניתוח — נסה שוב.');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResults(null);
    setForm(INITIAL_FORM);
  }

  return (
    <div style={s.root}>
      {/* Header */}
      <header style={s.header}>
        <span style={s.logo}>🛣 טרמפ<span style={{ color: '#4f9eff' }}>יט</span></span>
        <span style={s.badge}>v0.2 · BETA</span>
      </header>

      {/* Tabs */}
      <div style={s.tabs}>
        <button style={{ ...s.tab, ...(tab === 'search' ? s.tabActive : {}) }} onClick={() => setTab('search')}>🔍 חיפוש</button>
        <button style={{ ...s.tab, ...(tab === 'map' ? s.tabActive : {}) }} onClick={() => setTab('map')}>🗺 מפה</button>
      </div>

      {/* Content */}
      <div style={s.content}>
        {tab === 'search' && !results && (
          <>
            <SearchForm form={form} setForm={setForm} onAnalyze={handleAnalyze} loading={loading} />
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
        {tab === 'search' && results && (
          <Results {...results} onReset={handleReset} />
        )}
        {tab === 'map' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <MapComponent />
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={s.toast}>{toast}</div>
      )}
    </div>
  );
}

const s = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d0f14', color: '#f0f2f7', direction: 'rtl' },
  header: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', height: 56, background: 'rgba(13,15,20,0.95)', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 },
  logo: { fontSize: 20, fontWeight: 700 },
  badge: { fontSize: 10, fontWeight: 700, color: '#4f9eff', background: 'rgba(79,158,255,0.1)', border: '1px solid rgba(79,158,255,0.25)', padding: '2px 8px', borderRadius: 20 },
  tabs: { display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 },
  tab: { flex: 1, padding: '12px 0', background: 'none', border: 'none', color: '#7a8499', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Heebo, sans-serif', transition: 'color 0.2s' },
  tabActive: { color: '#4f9eff', borderBottom: '2px solid #4f9eff' },
  content: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  toast: { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1e2330', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 20px', fontSize: 14, color: '#f0f2f7', zIndex: 9999, whiteSpace: 'nowrap' },
  errorBox: { margin: '0 16px 16px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 12, padding: '16px', display: 'flex', gap: 12, alignItems: 'flex-start' },
  errorIcon: { fontSize: 20, flexShrink: 0 },
  errorTitle: { fontSize: 14, fontWeight: 700, color: '#f87171', marginBottom: 4 },
  errorMsg: { fontSize: 13, color: '#fca5a5', lineHeight: 1.5 },
};
