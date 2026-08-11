# Kan recipe discovery

## Status

Regular Hebrew `בואו לאכול איתי` seasons 5–9 are **not currently imported from Kan recipe pages**.

A live GitHub Actions import on 2026-08-11 tested the official episode pages recovered by `scripts/import-kan.ts`. It considered 105 season 5–9 hosting episodes and found **0 direct per-host recipe links** matching the known `/content/dig/recipes/<id>` recipe-page pattern.

Because the crawl produced no menu data and required an additional request per matched episode, recipe discovery is disabled in the regular Kan importer until a reliable index/feed is identified.

## What is confirmed

- Kan has a general recipes hub.
- Kan's Arabic edition of `בואו לאכול איתי` exposes individual host recipe pages with structured headings such as `מנה ראשונה`, `מנה עיקרית`, and `קינוח`.
- That Arabic-edition URL pattern is not evidence that the regular Hebrew seasons expose equivalent links in their episode HTML.

## Data policy

If a reliable regular-season recipe source is found later, import only factual menu metadata needed by the database:

- course
- dietary variant when explicitly labelled
- dish title
- direct source URL

Do not mirror full ingredient lists, preparation instructions, or images.

## Related safety fix

The same live import revealed that free-text contestant matching can confuse a host with another contestant merely mentioned in an episode description. Kan-to-contestant enrichment now prefers the structured `week + hostingOrder` already extracted from Wikipedia scoring tables. Explicit host wording is used only as a fallback when the structured order cannot uniquely identify one contestant.
