import { useState, useEffect } from 'react';
import Home        from './pages/Home.jsx';
import LoginScreen from './components/LoginScreen.jsx';

export default function App() {
  const [authed, setAuthed] = useState(null); // null = טוען, true/false = תוצאה

  useEffect(() => {
    // בודק אם יש session קיים על ידי קריאה קטנה לשרת
    fetch('/api/cities', { credentials: 'include' })
      .then(r => setAuthed(r.status !== 401))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null; // טוען — מסך ריק רגע

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  return <Home />;
}
