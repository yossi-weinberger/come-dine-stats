# Kan recipe discovery

## Status

Regular Hebrew `בואו לאכול איתי` seasons 5–9 are **not currently imported from Kan recipe pages**.

A live GitHub Actions import on 2026-08-11 tested the official episode pages recovered by `scripts/import-kan.ts`. It considered 105 season 5–9 hosting episodes and found **0 direct per-host recipe links** matching the known `/content/dig/recipes/<id>` recipe-page pattern.

Because the crawl produced no menu data and required an additional request per matched episode, recipe discovery is disabled in the regular Kan importer until a reliable index/feed is identified.

## Confirmed recipe architecture

Further source recovery on 2026-08-11 confirmed the architecture on Kan itself:

- Kan's global tags index exposes `בואו לאכול איתי בערבית - המתכונים`.
- Arabic-edition episode pages include a direct `המתכונים ... מחכים לכם כאן` link for the host.
- Those links resolve to first-party recipe pages under `/content/dig/recipes/<id>/`.
- The recipe pages have structured headings such as `מנה ראשונה`, `מנה עיקרית`, and `קינוח`, which makes them suitable for a factual menu importer without copying recipe instructions.
- Example chain: Arabic episode 8 for Abd -> `https://www.kan.org.il/content/dig/recipes/848289/`.

This proves that the recipe-page pattern is real and structured. It does **not** prove that equivalent public pages exist for the regular Hebrew seasons.

## Regular Hebrew seasons

The regular Hebrew season archive pages still contain a generic `המתכונים המלאים מחכים לכם כאן` callout, but the per-host episode crawl has not exposed equivalent recipe links. No dedicated regular-Hebrew recipe tag was found in the public tag index during this pass.

Season 9 also had a stale archive URL in the project. A current first-party season 9 page was recovered at:

`https://www.kan.org.il/content/kan/kan-11/p-11843/s9/922431/917568`

That URL is now the preferred source for season 9 episode metadata.

## Data policy

If a reliable regular-season recipe source is found later, import only factual menu metadata needed by the database:

- course
- dietary variant when explicitly labelled
- dish title
- direct source URL

Do not mirror full ingredient lists, preparation instructions, or images.

When a source proves that a dish was served but does not identify its course, store it as an unclassified `other` dish rather than guessing starter/main/dessert. Unclassified dishes must not increase the complete three-course-menu metric.

## Related safety fix

The earlier live import revealed that free-text contestant matching can confuse a host with another contestant merely mentioned in an episode description. Kan-to-contestant enrichment therefore prefers the structured `week + hostingOrder` already extracted from Wikipedia scoring tables. Explicit host wording is used only as a fallback when the structured order cannot uniquely identify one contestant.
