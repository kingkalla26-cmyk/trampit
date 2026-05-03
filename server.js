const express = require('express');
const path    = require('path');
const app     = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// מונע בקשות מרובות מדי מהר
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 4000; // לפחות 4 שניות בין בקשות

app.post('/api/analyze', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY לא מוגדר' });
  }

  // המתן אם עברו פחות מ-4 שניות מהבקשה האחרונה
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < MIN_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - timeSinceLast));
  }
  lastRequestTime = Date.now();

  try {
    const messages = req.body.messages || [];
    const parts = [];

    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ text: block.text });
          } else if (block.type === 'image') {
            parts.push({
              inline_data: {
                mime_type: block.source.media_type,
                data: block.source.data
              }
            });
          }
        }
      } else if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      }
    }

    const geminiBody = {
      contents: [{ parts }],
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.3,
      }
    };

    // נסה עד 3 פעמים אם יש 429
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody),
        }
      );

      const data = await response.json();
      console.log(`Attempt ${attempt} - Gemini status:`, response.status);

      if (response.status === 429) {
        console.log(`Rate limited, waiting ${attempt * 5}s before retry...`);
        await new Promise(r => setTimeout(r, attempt * 5000));
        lastError = data;
        continue;
      }

      if (!response.ok) {
        console.error('Gemini error:', JSON.stringify(data));
        return res.status(response.status).json({ error: data.error?.message || 'Gemini error' });
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return res.json({ content: [{ type: 'text', text }] });
    }

    // אחרי 3 ניסיונות כושלים
    return res.status(429).json({ error: 'השרת עמוס, נסה שוב בעוד דקה' });

  } catch (err) {
    console.error('Fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trampit server running on port ${PORT}`));

