import JunctionCard from '../components/JunctionCard.jsx';
import Layout from '../components/Layout.jsx';

const SAMPLES = [
  {
    name: 'צומת שמשון',
    road: 44,
    connectedRoads: [44, 38],
    direction: 'south',
    destination: ['בית שמש', 'ירושלים', 'רמלה'],
    isSafe: true,
    busLines: 10,
  },
  {
    name: 'צומת קסטינה (מלאכי)',
    road: 3,
    connectedRoads: [3, 40],
    direction: 'south',
    destination: ['קריית מלאכי', 'אשקלון', 'באר שבע', 'רחובות'],
    isSafe: true,
    busLines: 18,
  },
  {
    name: 'מחלף חולון',
    road: 20,
    connectedRoads: [20, 44],
    direction: 'north',
    destination: ['תל אביב', 'חולון', 'בת ים'],
    isSafe: true,
    busLines: 25,
  },
];

export default function JunctionCardDemo() {
  return (
    <Layout>
      <div style={{ padding: '24px 16px', direction: 'rtl' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: '#1f2937' }}>
          תצוגה מקדימה — JunctionCard
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
          {SAMPLES.map((s, i) => (
            <JunctionCard key={i} {...s} />
          ))}
        </div>
      </div>
    </Layout>
  );
}
