import { useState } from 'react';

export function useAnalyze() {
  const [loading,  setLoading]  = useState(false);
  const [results,  setResults]  = useState(null);
  const [apiError, setApiError] = useState('');

  async function analyze(form, routeIndex = 0) {
    setLoading(true);
    setResults(null);
    setApiError('');

    try {
      const params = new URLSearchParams({
        origin:      form.origin,
        carDest:     form.carDest,
        destination: form.destination,
        routeIndex:  routeIndex,
      });
      const res  = await fetch(`/api/route/exits?${params}`, { credentials: 'include' });
      const data = await res.json();

      if (res.status === 401) { setApiError('נדרשת התחברות מחדש — רענן את הדף.'); return null; }
      if (res.status === 429) { setApiError('יותר מדי בקשות — נסה שוב בעוד דקה.');   return null; }
      if (!res.ok)            { setApiError(data.error || 'שגיאה — נסה שוב.');        return null; }

      if (!data.exitPoints?.length) {
        setApiError('לא נמצאו נקודות יציאה לאורך המסלול — בדוק את הכתובות ונסה שוב.');
        return null;
      }

      const result = {
        data:        { options: data.exitPoints },
        origin:      form.origin,
        destination: form.destination,
        carDest:     form.carDest,
        routeDistKm: data.routeDistKm,
        totalOnRoute: data.totalOnRoute,
      };
      setResults(result);
      return result;
    } catch {
      setApiError('אירעה שגיאת רשת — נסה שוב.');
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
