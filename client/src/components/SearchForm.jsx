import AutocompleteInput from './AutocompleteInput.jsx';
import { IconSparkles, IconArrowLeft } from '../icons.jsx';

export default function SearchForm({ form, setForm, onAnalyze, loading, cities = [] }) {
  return (
    <div style={s.container}>

      {/* Hero strip */}
      <div style={s.hero}>
        <div style={s.heroLabel}>טרמפיט · ניווט חכם</div>
        <div style={s.heroTitle}>לאן הולכים היום?</div>
        <div style={s.heroSub}>מלא את הפרטים ונמצא את הצמתים הכי טובים</div>
      </div>

      {/* STEP 1 */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <div style={s.stepNum}>1</div>
          <div>
            <div style={s.cardTitle}>מאיפה לאיפה?</div>
            <div style={s.cardSub}>נקודת מוצא ויעד סופי שלך</div>
          </div>
        </div>
        <div style={s.cardBody}>
          <div style={s.inputRow}>
            <div style={s.inputGroup}>
              <label style={s.label}>
                <span style={{ ...s.lblDot, background: 'var(--primary)' }} />
                מוצא
              </label>
              <AutocompleteInput
                value={form.origin}
                onChange={v => setForm(f => ({ ...f, origin: v }))}
                placeholder="למשל: באר שבע"
                cities={cities}
                showLocationBtn={true}
              />
            </div>
            <div style={s.inputGroup}>
              <label style={s.label}>
                <span style={{ ...s.lblDot, background: 'var(--accent)' }} />
                יעד
              </label>
              <AutocompleteInput
                value={form.destination}
                onChange={v => setForm(f => ({ ...f, destination: v }))}
                placeholder="למשל: ירושלים"
                cities={cities}
              />
            </div>
          </div>
        </div>
      </div>

      {/* connector — route line linking step 1 to step 2 */}
      <div style={s.stepConnector}>
        <div style={s.stepConnectorLine} />
      </div>

      {/* STEP 2 */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <div style={s.stepNum}>2</div>
          <div>
            <div style={s.cardTitle}>לאן נוסע הרכב?</div>
            <div style={s.cardSub}>יעד הנהג — עוזר למצוא נקודת ירידה</div>
          </div>
        </div>
        <div style={s.cardBody}>
          <AutocompleteInput
            value={form.carDest}
            onChange={v => setForm(f => ({ ...f, carDest: v }))}
            placeholder="למשל: חיפה, תל אביב, אשדוד..."
            cities={cities}
          />
        </div>
      </div>

      {/* ANALYZE BUTTON */}
      <button
        className="cta-primary-btn"
        style={{ ...s.analyzeBtn, opacity: loading ? 0.65 : 1 }}
        onClick={onAnalyze}
        disabled={loading}
      >
        <div style={s.analyzeBtnLeft}>
          <IconSparkles size={17} style={{ color: 'var(--background)', opacity: 0.9 }} />
          <span>{loading ? 'מנתח מסלול...' : 'נתח מסלול — מצא את הצמתים'}</span>
        </div>
        <IconArrowLeft size={16} style={{ opacity: 0.45 }} />
      </button>

      {/* LOADING */}
      {loading && (
        <div style={s.loadingBox}>
          <div style={s.spinner} />
          <div style={s.loadingSteps}>
            {['מנתח את המסלול...', 'מחפש צמתי חיבור...', 'בודק תחבורה ציבורית...', 'סורק נקודות טרמפ...', 'מחשב אפשרויות...'].map((txt, i) => (
              <div key={i} style={s.loadingStep}>
                <span style={s.dot} />
                {txt}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes trampit-spin { to { transform: rotate(360deg); } }
        @keyframes trampit-dash { from { background-position-y: 0; } to { background-position-y: 26px; } }
        .cta-primary-btn { transition: transform .15s ease, box-shadow .15s ease; }
        @media (hover: hover) {
          .cta-primary-btn:hover:not(:disabled) { transform: scale(1.01); box-shadow: 0 16px 40px -8px rgba(28,25,23,0.22); }
        }
        .cta-primary-btn:active:not(:disabled) { transform: scale(0.99); }
      `}</style>
    </div>
  );
}

const s = {
  container: {
    display: 'flex', flexDirection: 'column',
    gap: 16, padding: '24px 16px 80px',
  },

  hero: {
    background: 'var(--primary)',
    borderRadius: 16,
    padding: '20px 24px',
    color: 'var(--primary-foreground)',
    display: 'flex', flexDirection: 'column', gap: 6,
    position: 'relative', overflow: 'hidden',
  },
  heroLabel: {
    fontSize: 11, fontWeight: 700,
    letterSpacing: '0.08em', opacity: 0.72,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontFamily: 'var(--font-heading)',
    fontSize: 22, fontWeight: 800,
    letterSpacing: '-0.02em', lineHeight: 1.15,
  },
  heroSub: {
    fontSize: 13, opacity: 0.75, fontWeight: 500,
    lineHeight: 1.5, marginTop: 4,
  },

  card: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    boxShadow: '0 2px 8px rgba(28,25,23,0.04)',
  },
  cardHeader: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '16px 24px 12px',
    borderBottom: '1px solid var(--muted)',
  },
  stepNum: {
    fontFamily: 'var(--font-heading)',
    width: 32, height: 32, borderRadius: '50%',
    background: 'var(--primary)', color: 'var(--primary-foreground)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14.5, fontWeight: 700, flexShrink: 0,
  },
  cardTitle: {
    fontFamily: 'var(--font-heading)',
    fontSize: 15.5, fontWeight: 700, color: 'var(--foreground)',
    letterSpacing: '-0.01em', lineHeight: 1.2,
  },
  cardSub: { fontSize: 13, color: 'var(--muted-foreground)', marginTop: 3, lineHeight: 1.4 },
  cardBody: { padding: '16px 24px 24px' },

  stepConnector: { display: 'flex', paddingRight: 40, height: 4, margin: '-8px 0' },
  stepConnectorLine: {
    width: 2, height: 24,
    backgroundImage: 'repeating-linear-gradient(to bottom, rgb(var(--primary-rgb)) 0 6px, transparent 6px 13px)',
    backgroundSize: '2px 26px',
    animation: 'trampit-dash 1.6s linear infinite',
  },

  inputRow:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  inputGroup:{ display: 'flex', flexDirection: 'column', gap: 8 },
  label: {
    fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)',
    display: 'flex', alignItems: 'center', gap: 6,
    letterSpacing: '0.03em',
  },
  lblDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },

  analyzeBtn: {
    background: 'var(--foreground)',
    border: 'none', borderRadius: 12,
    padding: '16px 24px',
    color: 'var(--background)', fontSize: 15.5, fontWeight: 700,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, fontFamily: 'var(--font-heading)',
    width: '100%',
    letterSpacing: '-0.01em',
    transition: 'opacity 0.15s',
  },
  analyzeBtnLeft: {
    display: 'flex', alignItems: 'center', gap: 10,
  },

  loadingBox: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '20px 24px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 16, boxShadow: '0 2px 8px rgba(28,25,23,0.04)',
  },
  spinner: {
    width: 28, height: 28,
    border: '2.5px solid var(--border)',
    borderTop: '2.5px solid var(--primary)',
    borderRadius: '50%',
    animation: 'trampit-spin 0.75s linear infinite',
  },
  loadingSteps: { display: 'flex', flexDirection: 'column', gap: 10, width: '100%' },
  loadingStep: {
    display: 'flex', alignItems: 'center', gap: 10,
    fontSize: 13, color: 'var(--muted-foreground)',
  },
  dot: {
    width: 6, height: 6, borderRadius: '50%',
    background: 'var(--primary)', flexShrink: 0,
  },
};
