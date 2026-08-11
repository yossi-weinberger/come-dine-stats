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

Every imported field gets the exact source URL in `fieldSources`. Conflicting evidence is handled by the normal merge engine and remains visible in `data/reports/conflicts.json`.

## Imported evidence

### Season 6 — שרון בוננו

Source: Ynet, **"היו פיצוצים שלא ראו בתוכנית": המנצחים של "בואו לאכול איתי" פותחים הכול**, by גבי בר חיים, 2022-09-23.

URL: https://www.ynet.co.il/entertainment/article/s1ffezdbs

Explicit facts used:
- age: 49
- city: פתח תקווה
- occupation: מורה לתקשורת ומחנכת

The article is used as factual evidence only. No article prose or media is copied into the dataset.
