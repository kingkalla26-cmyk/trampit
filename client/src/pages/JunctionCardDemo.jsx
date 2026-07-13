import { useState } from 'react';
import JunctionCard      from '../components/JunctionCard.jsx';
import Layout            from '../components/Layout.jsx';
import { useJunctions }  from '../components/JunctionProvider.jsx';

export default function JunctionCardDemo() {
  const { junctions, isLoading, error } = useJunctions();
  const [search, setSearch] = useState('');

  const visible = junctions.filter(j =>
    j.name.includes(search) ||
    j.connectedRoads.some(r => String(r).includes(search)) ||
    j.destination.some(d => d.includes(search)),
  );

  if (isLoading) return null; // SplashScreen handled by JunctionProvider

  return (
    <Layout>
      <div style={{ padding: '24px 16px', direction: 'rtl' }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
            צמתים — נתוני OpenStreetMap
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
            {error
              ? `⚠️ ${error}`
              : `${junctions.length} צמתים נטענו מה-OSM`}
          </p>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="חפש לפי שם, כביש או יעד..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            fontSize: 14,
            marginBottom: 20,
            boxSizing: 'border-box',
            direction: 'rtl',
          }}
        />

        {/* Cards */}
        {error && junctions.length === 0 ? (
          <p style={{ color: 'var(--destructive)', textAlign: 'center', marginTop: 40 }}>
            לא ניתן לטעון נתונים. בדוק חיבור לאינטרנט.
          </p>
        ) : visible.length === 0 ? (
          <p style={{ color: 'var(--muted-foreground)', textAlign: 'center', marginTop: 40 }}>
            לא נמצאו צמתים התואמים את החיפוש.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
            {visible.slice(0, 50).map(j => (
              <JunctionCard key={j.id} {...j} />
            ))}
            {visible.length > 50 && (
              <p style={{ color: 'var(--muted-foreground)', fontSize: 13, marginTop: 8 }}>
                מוצגים 50 מתוך {visible.length} תוצאות. צמצם את החיפוש.
              </p>
            )}
          </div>
        )}

      </div>
    </Layout>
  );
}
