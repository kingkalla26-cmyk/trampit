import { useState } from 'react';

const TIME_LABELS = { now: 'עכשיו', morning: 'בוקר', noon: 'צהריים', afternoon: 'אחה"צ', evening: 'ערב' };

export function useAnalyze() {
  const [loading,  setLoading]  = useState(false);
  const [results,  setResults]  = useState(null);
  const [apiError, setApiError] = useState('');

  async function analyze(form) {
    setLoading(true);
    setResults(null);
    setApiError('');

    const timeLabel = TIME_LABELS[form.travelTime] || 'עכשיו';
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
      "trampScore": 8,
      "best": true
    }
  ],
  "hotspots": [
    { "name": "שם הנקודה", "direction": "לאן מקבלים טרמפ", "heat": 4, "bestTime": "שעות פעיל" }
  ],
}`,
    });

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messages: [{ role: 'user', content: userContent }] }),
      });
      const data = await res.json();

      if (res.status === 401) { setApiError('נדרשת התחברות מחדש — רענן את הדף.'); return null; }
      if (res.status === 429) { setApiError('מכסת ה-API מלאה — נסה שוב בעוד דקה.'); return null; }
      if (data.error)         { setApiError(data.error); return null; }

      const text  = (data.content || []).map(b => b.text || '').join('');
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean.substring(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
      const result = { data: parsed, origin: form.origin, destination: form.destination, carDest: form.carDest };
      setResults(result);
      return result;
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('timeout') || msg.includes('abort')) setApiError('השרת לא הגיב בזמן — נסה שוב.');
      else                         setApiError('שגיאה בניתוח — נסה שוב.');
      return null;
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResults(null);
    setApiError('');
  }

  return { loading, results, apiError, analyze, reset };
}
