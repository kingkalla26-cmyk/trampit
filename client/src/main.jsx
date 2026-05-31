import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import 'leaflet/dist/leaflet.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// מסיר את ה-HTML splash אחרי ש-React צייר את ה-frame הראשון
// שני rAF מבטיחים שה-DOM עודכן לפני ההסרה
requestAnimationFrame(() => requestAnimationFrame(() => {
  const el = document.getElementById('html-splash');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 420);
}));
