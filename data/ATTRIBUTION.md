# Attribution & reuse notes

הקובץ הזה הוא חלק מהדאטה, לא הערת שוליים. המטרה: שאם המאגר ייצא בעתיד כ-JSON/CSV/API, הקרדיטים לא ייעלמו יחד עם ה-UI.

## `legacy` — dine-with-me / עונת הסטטיסטיקות

- Original project: https://github.com/nemo369/dine-with-me
- Creator/account credited: `nemo369`
- We discovered the historical Strapi endpoint and data shape through the project's public source.
- No explicit repository license was found during this pass.
- Policy: use factual metadata with attribution; do not copy original app code, design or media assets into this project unless licensing/permission is clarified.

## `wayback` — Internet Archive

- Archive service: https://web.archive.org/
- A Wayback snapshot is evidence of the historical source; it is not a new license for that content.
- Recovered rows must keep both `originalUrl` and `snapshotUrl`.

## `fandom` — בואו לאכול איתי Wiki

- Wiki: https://comedinewithmeil.fandom.com/he/wiki/
- Fandom's default wiki-text license is CC BY-SA 3.0 unless the individual wiki states otherwise.
- License policy: https://www.fandom.com/licensing
- Every imported contestant keeps a direct page URL for attribution.
- Do not assume images/media have the same license as wiki text.

## `kan` — כאן 11

- Official program archive: https://www.kan.org.il/content/kan/kan-11/p-11843/
- Used as a primary source for factual metadata such as season/episode identity, ordering and official links.
- Do not mirror video, images or long editorial text unless separate permission/license allows it.

## `foodik` — Foodik / contestant first-person sources

- Site: https://www.foodik.co.il/
- Used only when a participant directly identifies the dishes they served on the show.
- Every imported dish keeps the exact article URL as evidence.
- Import only short factual menu metadata. Do not copy recipe instructions, article prose, images or other protected content.

## `rest` — REST / Zap Rest

- Magazine: https://www.rest.co.il/magazine/
- Used only for episode recaps that explicitly identify a host and name the dishes they served.
- Every imported dish keeps the exact article URL as evidence.
- Import only short factual menu metadata; do not copy article prose or images.

## Conflict rule

No source silently overwrites another source. Conflicting values are preserved as evidence and resolved separately for presentation.
