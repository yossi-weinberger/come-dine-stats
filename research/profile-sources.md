# Supplemental profile sources

`data/supplemental/profiles.json` is the small, reviewed evidence layer for contestant profile facts that are missing from the structured primary imports.

## Admission rule

A field may be added only when the source:

1. identifies the contestant unambiguously in the context of **בואו לאכול איתי** and the relevant season/time period; and
2. states the field explicitly.

Allowed examples:
- `שרון בוננו (49)` → age 49
- `גרה בפתח תקווה` → city פתח תקווה
- `מלמדת תקשורת` → occupation מורה לתקשורת

Not allowed:
- calculating an age from a guessed or unsourced birth year
- inferring a city from a week's region name
- translating a hobby, one-off activity or meal style into an occupation/diet
- matching a same-named person without show-specific evidence
- copying biographical prose that is not needed for a normalized field

Every imported field gets the exact source URL in `fieldSources`. Incompatible evidence remains visible in `data/reports/conflicts.json`; compatible differences in specificity are preserved separately in `data/reports/refinements.json`.

## Kan occupation audit — 2026-08-11

The official Kan season-archive episode titles for seasons 5–10 were reviewed after the Hebrew-prefix fix in `scripts/import-kan.ts`.

Current result:
- Kan automatically extracts 21 explicit occupation facts from host-local episode text.
- The common explicit profession patterns exposed by the archive titles are already covered by the conservative `occupationCues` list.
- The Hebrew-prefix fallback recovered the previously missed `לעמנואל` case, yielding `מורה לתנ״ך וסולן להקה` for עמנואל יצחק לוי from the official season 8 episode title.

Examples of explicit occupations that are valid for normalization include:
- `קציעה, היועצת מינית`
- `שחר הבלוגר`
- `המתקשרת והיוצרת יהודית`
- `כוכב הרשת אביעד`
- `פאדי איש התקשורת`
- `ענבל המורה`
- `מעיין, מסדרת ארונות מקצועית וסטייליסטית`
- `איתמר ההייטקיסט`
- `יוסל'ה, ספר נשים ביום ודראגיסט בלילה`
- `קמילה, מעצבת פנים`
- `אבנית בלוגרית טיולים`
- `עדי, בעלת סטודיו לריקוד`
- `איריס, מעבירה ערבי הפרשות חלה`
- `עליזה, ליצנית רפואית`

Descriptors that are intentionally **not** normalized as occupations include:
- `אושרית, פעילה נגד המסתננים` — activism descriptor, not an explicit job
- `אחיה, לוחם חופש` — identity/ideological descriptor, not an explicit job
- `אילנית, זוכת מדליית הזהב בתחרות הפאראטריאתלון` — achievement, not an explicit occupation
- `לירון, מובטל טרי` — employment status, not an occupation

Conclusion: the safe **occupation-from-Kan-archive-title** path is considered substantially saturated. Further occupation coverage should come from reviewed supplemental sources or from a newly discovered first-party structured profile source, rather than broadening the extractor into personality, ideology, hobbies or inferred professions.

## Imported evidence

### Season 6 — שרון בוננו

Source: Ynet, **"היו פיצוצים שלא ראו בתוכנית": המנצחים של "בואו לאכול איתי" פותחים הכול**, by גבי בר חיים, 2022-09-23.

URL: https://www.ynet.co.il/entertainment/article/s1ffezdbs

Explicit facts used:
- age: 49
- city: פתח תקווה
- occupation: מורה לתקשורת ומחנכת

The article is used as factual evidence only. No article prose or media is copied into the dataset.
