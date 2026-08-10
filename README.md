# בואו לאכול איתי — הדאטאבייס

מאגר לא-רשמי שמרכז מתמודדים, שבועות, ציונים, מנות ומקורות מכל עונות **בואו לאכול איתי** ומייצר מהם סטטיסטיקות searchable.

## מצב הפרויקט

**Milestone 0.2 — source-first ingestion**

- Next.js 16 + TypeScript, RTL-first.
- סכמת Postgres/Supabase למתמודדים, שבועות, מנות ומקורות.
- provenance ברמת שדה (`field_evidence`) — כדי שלא נאבד מאיפה הגיע כל נתון.
- עמוד `/sources` עם קרדיטים, רישיונות ומדיניות שימוש.
- source badge בכל כרטיס מתמודד.
- importer ל-Strapi הישן + recovery אוטומטי דרך Wayback CDX/replay.
- importer ל-Fandom דרך MediaWiki API עם attribution ישיר לכל עמוד.
- normalizer לנתוני legacy, כולל `city`, `order`, `final_place`, `family_status` והקשר ל-`week` שהתגלו בקוד המקורי.
- merge engine ששומר conflicts במקום לדרוס אותם.

> `data/normalized/contestants.json` הוא המאגר המאוחד. כל source-specific importer כותב קודם לקובץ נפרד ורק `npm run merge` מאחד אותם.

## קרדיט ומקורות

1. **בואו לאכול איתי — עונת הסטטיסטיקות / `nemo369`** — הפרויקט ההיסטורי שהיווה בסיס חשוב להבנת מבנה הדאטה וה-API: `https://github.com/nemo369/dine-with-me`. לא מצאנו רישיון מפורש בריפו, ולכן לא מעתיקים ממנו קוד/עיצוב או מדיה; שומרים קרדיט ומשתמשים בעובדות/מטא-דאטה.
2. **Internet Archive / Wayback Machine** — משמש לשחזור snapshots של ה-API הישן. כל שחזור שומר גם URL מקור וגם URL snapshot.
3. **בואו לאכול איתי Wiki ב-Fandom** — מידע ברמת מתמודד ותפריט. כל רשומה שומרת קישור ישיר לעמוד המקורי. לפי מדיניות Fandom, טקסט wiki הוא בדרך כלל CC BY-SA 3.0 אלא אם מצוין אחרת; מדיה אינה בהכרח תחת אותו רישיון.
4. **כאן 11** — מקור רשמי לפרקים/עונות/סדר שידור וקישורים. משתמשים בעיקר בעובדות ומטא-דאטה ולא משכפלים נכסי מדיה או טקסטים ארוכים.

פירוט מלא: `data/ATTRIBUTION.md` וגם באתר ב-`/sources`.

## Data model

העיקרון: **לא שומרים רק value — שומרים גם evidence**.

- `seasons`
- `weeks`
- `contestants`
- `dishes`
- `sources`
- `field_evidence`

אם Fandom אומר גיל 34 ומקור אחר אומר 35, שתי העדויות נשמרות. `scripts/merge.ts` בוחר ערך להצגה לפי source priority אבל כותב את הסתירה ל-`data/reports/conflicts.json`.

## הרצה

```bash
npm install
npm run dev
```

## Pipeline

### 1. ניסיון ישיר מול ה-Strapi הישן

```bash
npm run import:legacy
```

### 2. אם Heroku מת — שחזור מ-Wayback

```bash
npm run recover:legacy
```

ה-script מחפש captures של `contestants*` ו-`weeks*` ב-CDX API של Internet Archive, מוריד replay במצב `id_`, ובוחר את מערך ה-JSON הגדול ביותר שנמצא. נכתב גם `wayback-manifest.json` עם URLs ותאריכים.

### 3. נרמול legacy

```bash
npm run normalize
```

### 4. ייבוא Fandom

```bash
npm run import:fandom
```

ה-importer משתמש ב-MediaWiki API, מגלה מתמודדים ישירות דרך קטגוריות העונות (במקום לסרוק את כל הוויקי), ושומר `data/raw/fandom/coverage.json` עם מספר הדפים שנמצאו בכל עונה. הוא שומר גם raw HTML וגם normalized JSON ומחלץ: עונה, שבוע, סדר אירוח, גיל, עיר, מקצוע, מצב משפחתי, ניקוד, דירוג ותפריט; מזהה גם דירוגים מילוליים כמו "מקום ראשון" ומנות חלופיות טבעוניות/צמחוניות.

### 5. ייבוא metadata רשמי מכאן 11

```bash
npm run import:kan
```

ה-importer שומר `data/normalized/kan-episodes.json` עם עונה, פרק, שבוע, סדר אירוח וקישור רשמי. הוא לא מעתיק וידאו/תמונות. רשימת עמודי העונות נשמרת ב-`data/kan-season-pages.json` וניתנת לעדכון.

### 6. merge ושמירת conflicts

```bash
npm run merge
npm run stats
```

או pipeline מלא:

```bash
npm run import:all
```

## Backlog קרוב

- [x] Wayback recovery script ל-API הישן
- [x] importer Fandom עם attribution
- [x] merge + conflict report
- [x] sources/credits UI
- [ ] להריץ recovery בסביבה עם גישה לרשת ולבדוק כמה משורות עונות 1–4 באמת נשמרו ב-Wayback
- [x] importer ראשוני לארכיון כאן 11 (episode metadata + source URLs)
- [ ] להרחיב את Kan importer לעונות 5–6 ולעמודי מתכונים/עונה 10 תוך כדי שידור
- [ ] entity matching מתקדם (זוגות, משתתפים חוזרים, שינויי איות)
- [ ] דפי עונה / שבוע / מתמודד
- [ ] dashboard: winners, score distribution, age, hosting order, dish keywords
- [ ] full-text search על מנות
- [ ] תהליך update לעונה 10

## Disclaimer

פרויקט מעריצים לא-רשמי. אינו קשור לכאן, גיל הפקות, Fandom או בעלי הזכויות. Attribution אינו מחליף רישיון: לפני שכפול טקסט או מדיה יש לבדוק את תנאי המקור הספציפי.
