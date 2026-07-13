import { useState } from 'react';

const MAX_RATIO = 1.6;

function RouteCard({ route, i, isBest, onSelect, loading, dimmed }) {
  return (
    <button
      style={{
        ...s.card,
        ...(isBest  ? s.cardBest    : {}),
        ...(dimmed  ? s.cardDimmed  : {}),
      }}
      onClick={() => onSelect(route.index)}
      disabled={loading}
    >
      {/* זמן + מרחק + תג */}
      <div style={s.metaRow}>
        <span style={s.time}>{route.timeLabel}</span>
        <span style={s.metaDot}>·</span>
        <span style={s.dist}>{route.distKm} ק"מ</span>
        <div style={{ flex: 1 }} />
        {isBest && <span style={s.tagRecommended}>מומלץ</span>}
        {dimmed  && <span style={s.tagAlt}>מסלול חלופי</span>}
      </div>

      {/* תיאור */}
      <div style={s.summary}>{route.summaryText || `נתיב ${i + 1}`}</div>

      {/* תגי כביש */}
      <div style={s.roadsRow}>
        {route.roads.length > 0
          ? route.roads.map((r, ri) => (
              <span key={ri} style={s.roadGroup}>
                {ri > 0 && <span style={s.roadArrow}>→</span>}
                <span style={{ ...s.roadPill, ...(r === '6' ? s.roadPillToll : {}) }}>{r}</span>
              </span>
            ))
          : <span style={s.noRoad}>מסלול ישיר</span>
        }
        {route.note && (
          <span style={{ ...s.notePill, ...(route.note.includes('ללא') ? s.notePillGreen : {}) }}>
            {route.note}
          </span>
        )}
      </div>
    </button>
  );
}

export default function RouteOptions({ routes, onSelect, loading }) {
  const [showAll, setShowAll] = useState(false);

  const fastest    = routes[0]?.durationSec || Infinity;
  const mainRoutes = routes.filter(r => r.durationSec <= fastest * MAX_RATIO);
  const shown      = mainRoutes.length > 0 ? mainRoutes : routes.slice(0, 1);
  const hidden     = routes.filter(r => !shown.includes(r));

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.sectionLabel}>בחר מסלול</div>
        <div style={s.sub}>באיזה נתיב נוסע הרכב?</div>
      </div>

      <div style={s.list}>
        {shown.map((route, i) => (
          <RouteCard
            key={route.index}
            route={route}
            i={i}
            isBest={i === 0}
            onSelect={onSelect}
            loading={loading}
            dimmed={false}
          />
        ))}

        {hidden.length > 0 && (
          <button style={s.toggleBtn} onClick={() => setShowAll(o => !o)}>
            {showAll
              ? '▲ הסתר מסלולים נוספים'
              : `▼ ${hidden.length} מסלול${hidden.length > 1 ? 'ים' : ''} נוסף${hidden.length > 1 ? 'ים' : ''} (פחות מומלצים)`
            }
          </button>
        )}

        {showAll && hidden.map((route, i) => (
          <RouteCard
            key={route.index}
            route={route}
            i={shown.length + i}
            isBest={false}
            onSelect={onSelect}
            loading={loading}
            dimmed={true}
          />
        ))}
      </div>
    </div>
  );
}

const s = {
  container: { padding: '24px 16px 80px' },
  header:    { marginBottom: 16 },
  sectionLabel: {
    fontSize: 13, fontWeight: 800, color: 'var(--muted-foreground)',
    letterSpacing: '0.04em', textTransform: 'uppercase',
    marginBottom: 4,
  },
  sub: { fontSize: 13, color: 'var(--muted-foreground)' },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },

  card: {
    background: 'var(--card)',
    border: '1.5px solid var(--border)',
    borderRadius: 16,
    padding: '16px 24px',
    textAlign: 'right',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    boxShadow: '0 2px 8px rgba(28,25,23,0.04)',
    display: 'flex', flexDirection: 'column', gap: 10,
    transition: 'box-shadow 0.15s, border-color 0.15s',
    width: '100%',
  },
  cardBest: {
    border: '2px solid var(--primary)',
    boxShadow: '0 4px 16px rgba(var(--primary-rgb),0.08)',
  },
  cardDimmed: {
    background: 'var(--background)',
    border: '1.5px solid var(--muted)',
    opacity: 0.82,
  },

  metaRow:  { display: 'flex', alignItems: 'baseline', gap: 8 },
  time:     {
    fontFamily: 'var(--font-mono)',
    fontSize: 21, fontWeight: 500, color: 'var(--foreground)',
    letterSpacing: '-0.01em', lineHeight: 1,
  },
  metaDot:  { color: 'var(--border)', fontSize: 16 },
  dist:     { fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--muted-foreground)', fontWeight: 500 },

  tagRecommended: {
    fontSize: 11, fontWeight: 800, color: 'var(--primary)',
    background: 'rgba(var(--primary-rgb),0.08)', border: '1px solid rgba(var(--primary-rgb),0.3)',
    borderRadius: 999, padding: '3px 10px',
    whiteSpace: 'nowrap', letterSpacing: '0.01em',
  },
  tagAlt: {
    fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)',
    background: 'var(--muted)', border: '1px solid var(--border)',
    borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap',
  },

  summary: {
    fontSize: 13, fontWeight: 600, color: 'var(--muted-foreground)', lineHeight: 1.5,
  },

  roadsRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  roadGroup:{ display: 'flex', alignItems: 'center', gap: 6 },
  roadPill: {
    background: 'var(--muted)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '3px 12px',
    fontSize: 13, fontWeight: 700, color: 'var(--foreground)',
  },
  roadPillToll: {
    background: 'rgba(var(--primary-rgb),0.08)', border: '1px solid rgba(var(--primary-rgb),0.3)', color: 'var(--primary)',
  },
  roadArrow: { color: 'var(--border)', fontSize: 11, lineHeight: 1 },
  noRoad:    { fontSize: 13, color: 'var(--muted-foreground)' },

  notePill: {
    fontSize: 11, fontWeight: 700, color: 'var(--primary)',
    background: 'rgba(var(--primary-rgb),0.08)', border: '1px solid rgba(var(--primary-rgb),0.3)',
    borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap',
  },
  notePillGreen: {
    color: 'var(--accent)', background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.35)',
  },

  toggleBtn: {
    background: 'none',
    border: '1px dashed var(--border)',
    borderRadius: 12,
    padding: '11px 16px',
    fontSize: 13, color: 'var(--muted-foreground)',
    cursor: 'pointer', fontFamily: 'var(--font-body)',
    width: '100%', textAlign: 'center',
    transition: 'border-color 0.15s, color 0.15s',
  },
};
