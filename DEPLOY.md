# 🚀 העלאה ל-Railway — מדריך שלב-שלב

## מה זה Railway?
שירות חינמי שמריץ את השרת שלך באינטרנט.
אתה מעלה את הקוד — הם מטפלים בכל השאר.

---

## שלב 1 — הירשם ל-Railway
1. כנס ל-https://railway.app
2. לחץ **Login** → **Login with GitHub**
3. אם אין לך GitHub: הירשם ב-github.com קודם (חינם, דקה אחת)

---

## שלב 2 — העלה את הפרויקט
1. ב-Railway לחץ **New Project**
2. בחר **Deploy from GitHub repo**
   - אם זו הפעם הראשונה: לחץ **Configure GitHub App** ותן הרשאה
3. לחץ **Add variables** (נסביר בשלב הבא)

### חלופה — ללא GitHub (יותר פשוט):
1. ב-Railway לחץ **New Project** → **Empty Project**
2. לחץ **+ Add Service** → **Empty Service**
3. לחץ על השירות → לשונית **Source** → **Connect Repo**
   או: גרור את תיקיית הפרויקט כולה

---

## שלב 3 — הגדר את ה-API Key (הכי חשוב!)
1. לחץ על השירות שיצרת
2. עבור ללשונית **Variables**
3. לחץ **New Variable**
4. שם: `ANTHROPIC_API_KEY`
5. ערך: המפתח שלך (מתחיל ב-`sk-ant-...`)
6. לחץ **Add**

---

## שלב 4 — פרוס!
1. Railway יתחיל לבנות אוטומטית (30-60 שניות)
2. לחץ על **Settings** → תחת **Domains** לחץ **Generate Domain**
3. תקבל קישור כמו: `trampit-production.up.railway.app`

**שלח את הקישור לכולם — האתר עובד! 🎉**

---

## אם משהו לא עובד
- לחץ **Deployments** → לחץ על הפריסה → **View Logs**
- הודעת שגיאה נפוצה: `Cannot find module 'express'` → Railway צריך לרוץ `npm install` אוטומטית, אם לא — הוסף Variable: `NPM_CONFIG_PRODUCTION=false`

---

## עלות
Railway נותנים $5 קרדיט חינמי בחודש — מספיק לאתר קטן.
לשימוש יותר כבד: $5/חודש.
