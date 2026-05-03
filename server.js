const express = require('express');
const path    = require('path');
const app     = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== GEMINI API PROXY =====
app.post('/api/analyze', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('ERROR: GEMINI_API_KEY is not set!');
    return res.status(500).json({ error: 'GEMINI_API_KEY לא מוגדר' });
  }

  try {
    // בנה את הפרומפט מתוך messages שנשלחו
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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      }
    );

    const data = await response.json();
    console.log('Gemini status:', response.status);

    if (!response.ok) {
      console.error('Gemini error:', JSON.stringify(data));
      return res.status(response.status).json({ error: data.error?.message || 'Gemini error' });
    }

    // המר תשובת Gemini לפורמט של Anthropic כדי שהפרונטאנד יבין
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.json({
      content: [{ type: 'text', text }]
    });

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
