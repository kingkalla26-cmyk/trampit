import { useRef } from 'react';
import AutocompleteInput from './AutocompleteInput.jsx';

const NAV_PATTERNS = [/waze\.com/i, /waze:\/\//i, /maps\.google\./i, /goo\.gl\/maps/i, /maps\.app\.goo\.gl/i];

function isNavLink(url) {
  try { new URL(url); return NAV_PATTERNS.some(p => p.test(url)); }
  catch { return false; }
}

export default function SearchForm({ form, setForm, onAnalyze, loading, cities = [] }) {
  const fileInputRef = useRef();

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm(f => ({ ...f, uploadedImage: ev.target.result.split(',')[1], imagePreview: ev.target.result }));
    };
    reader.readAsDataURL(file);
  }

  function handleWazeLink(val) {
    const trimmed = val.trim();
    let status = '';
    let linkVal = null;
    if (!trimmed) {
      status = '';
    } else if (isNavLink(trimmed)) {
      linkVal = trimmed;
      status = 'ok';
    } else if (trimmed.startsWith('http') || trimmed.startsWith('waze')) {
      linkVal = trimmed;
      status = 'warning';
    } else {
      status = 'error';
    }
    setForm(f => ({ ...f, wazeLink: linkVal, wazeLinkInput: val, wazeLinkStatus: status }));
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      handleWazeLink(text);
    } catch {
      alert('לא ניתן לגשת ללוח — הדבק ידנית');
    }
  }

  return (
    <div style={s.container}>
      {/* STEP 1 */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <div style={{ ...s.stepNum, ...s.stepActive }}>1</div>
          <div>
            <div style={s.cardTitle}>מאיפה לאיפה?</div>
            <div style={s.cardSub}>הזן את נקודת המוצא והיעד שלך</div>
          </div>
        </div>
        <div style={s.inputRow}>
          <div style={s.inputGroup}>
            <label style={s.label}>🔵 נקודת מוצא</label>
            <AutocompleteInput
              value={form.origin}
              onChange={v => setForm(f => ({ ...f, origin: v }))}
              placeholder="למשל: באר שבע"
              cities={cities}
            />
          </div>
          <div style={s.inputGroup}>
            <label style={s.label}>🟢 יעד סופי</label>
            <AutocompleteInput
              value={form.destination}
              onChange={v => setForm(f => ({ ...f, destination: v }))}
              placeholder="למשל: ירושלים"
              cities={cities}
            />
          </div>
        </div>
      </div>

      {/* STEP 2 */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <div style={s.stepNum}>2</div>
          <div>
            <div style={s.cardTitle}>הטרמפ שלך</div>
            <div style={s.cardSub}>לאן נוסע הרכב שבו אתה נוסע?</div>
          </div>
        </div>
        <div style={s.inputGroup}>
          <label style={s.label}>🚗 יעד הרכב (לא שלך)</label>
          <AutocompleteInput
            value={form.carDest}
            onChange={v => setForm(f => ({ ...f, carDest: v }))}
            placeholder="למשל: חיפה, תל אביב, אשדוד..."
            cities={cities}
          />
        </div>
        <div style={s.inputGroup}>
          <label style={s.label}>⏰ שעת נסיעה משוערת</label>
          <select
            style={s.input}
            value={form.travelTime}
            onChange={e => setForm(f => ({ ...f, travelTime: e.target.value }))}
          >
            <option value="now">עכשיו</option>
            <option value="morning">בוקר (07:00–10:00)</option>
            <option value="noon">צהריים (12:00–14:00)</option>
            <option value="afternoon">אחה"צ (15:00–18:00)</option>
            <option value="evening">ערב (18:00–21:00)</option>
          </select>
        </div>
      </div>

      {/* STEP 3 */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <div style={s.stepNum}>3</div>
          <div>
            <div style={s.cardTitle}>מסלול הנסיעה</div>
            <div style={s.cardSub}>שתף מסלול מ-Waze לקבל המלצות מדויקות יותר</div>
          </div>
        </div>

        <div style={s.wazeBox}>
          <div style={s.wazeLabel}>🔗 הדבק קישור שיתוף מסלול</div>
          <div style={s.wazeRow}>
            <input
              style={{ ...s.input, flex: 1 }}
              type="url"
              placeholder="הדבק קישור Waze / Google Maps..."
              value={form.wazeLinkInput || ''}
              onChange={e => handleWazeLink(e.target.value)}
              autoComplete="off"
            />
            <button style={s.pasteBtn} onClick={pasteFromClipboard}>📋 הדבק</button>
            {form.wazeLinkInput && (
              <button style={s.clearBtn} onClick={() => setForm(f => ({ ...f, wazeLink: null, wazeLinkInput: '', wazeLinkStatus: '' }))}>✕</button>
            )}
          </div>
          {form.wazeLinkStatus === 'ok' && <div style={{ ...s.linkStatus, color: '#34d399' }}>✓ קישור ניווט זוהה</div>}
          {form.wazeLinkStatus === 'warning' && <div style={{ ...s.linkStatus, color: '#fbbf24' }}>⚠ קישור זוהה — AI ינסה לפרש</div>}
          {form.wazeLinkStatus === 'error' && <div style={{ ...s.linkStatus, color: '#f87171' }}>✕ לא נראה כקישור תקין</div>}
        </div>

        <div style={s.orDivider}>או</div>

        <div
          style={s.uploadZone}
          onClick={() => fileInputRef.current.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        >
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])} />
          <div style={{ fontSize: 28 }}>📸</div>
          <div style={s.uploadTitle}>העלה צילום מסך של Waze</div>
          <div style={s.uploadSub}>גרור או לחץ לבחירת קובץ · PNG, JPG</div>
        </div>

        {form.imagePreview && (
          <img src={form.imagePreview} alt="preview" style={s.preview} />
        )}
      </div>

      {/* ANALYZE BUTTON */}
      <button style={{ ...s.analyzeBtn, opacity: loading ? 0.6 : 1 }} onClick={onAnalyze} disabled={loading}>
        <span>✦</span>
        <span>{loading ? 'מנתח...' : 'נתח מסלול — מצא לי את הצמתים הטובים'}</span>
        <span>←</span>
      </button>

      {/* LOADING */}
      {loading && (
        <div style={s.loadingBox}>
          <div style={s.spinner} />
          {['מנתח את המסלול...', 'מחפש צמתי חיבור...', 'בודק תחבורה ציבורית...', 'סורק נקודות טרמפ...', 'מחשב אפשרויות...'].map((txt, i) => (
            <div key={i} style={s.loadingStep}><span style={s.dot} />{txt}</div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 16px 80px' },
  card: { background: '#161a22', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  stepNum: { width: 28, height: 28, borderRadius: '50%', background: '#1e2330', border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#7a8499', flexShrink: 0 },
  stepActive: { background: '#2563eb', border: '1px solid #2563eb', color: '#fff' },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#f0f2f7' },
  cardSub: { fontSize: 13, color: '#7a8499', marginTop: 2 },
  inputRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: 500, color: '#7a8499', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { background: '#1e2330', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '12px 14px', color: '#f0f2f7', fontSize: 15, fontFamily: 'Heebo, sans-serif', direction: 'rtl', outline: 'none', width: '100%' },
  wazeBox: { marginBottom: 12 },
  wazeLabel: { fontSize: 13, color: '#7a8499', marginBottom: 8 },
  wazeRow: { display: 'flex', gap: 8, alignItems: 'center' },
  pasteBtn: { background: '#1e2330', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '10px 12px', color: '#f0f2f7', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' },
  clearBtn: { background: 'transparent', border: 'none', color: '#7a8499', cursor: 'pointer', fontSize: 16, padding: '0 4px' },
  linkStatus: { fontSize: 12, marginTop: 6 },
  orDivider: { textAlign: 'center', color: '#4a5168', fontSize: 13, margin: '12px 0' },
  uploadZone: { border: '1.5px dashed rgba(255,255,255,0.14)', borderRadius: 12, padding: '24px 20px', textAlign: 'center', cursor: 'pointer' },
  uploadTitle: { fontSize: 14, fontWeight: 600, color: '#f0f2f7', marginTop: 8 },
  uploadSub: { fontSize: 12, color: '#7a8499', marginTop: 4 },
  preview: { width: '100%', borderRadius: 10, marginTop: 12, maxHeight: 200, objectFit: 'cover' },
  analyzeBtn: { background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', border: 'none', borderRadius: 14, padding: '16px 24px', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: 'Heebo, sans-serif' },
  loadingBox: { background: '#161a22', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  spinner: { width: 32, height: 32, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 8 },
  loadingStep: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#7a8499' },
  dot: { width: 6, height: 6, borderRadius: '50%', background: '#2563eb', display: 'inline-block' },
};
