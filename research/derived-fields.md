# Derived fields

Some fields can be computed deterministically from sourced facts that are already in the dataset. Derived values are allowed only when the transformation is explicit, auditable and conservative.

## Weekly placement from scores

`placement` may be filled from weekly scores only when all of the following are true:

1. the entry belongs to a known `season + week`;
2. there are at least two active competition entries in that week;
3. every active entry in the week has a numeric score;
4. all scores in the week are unique — any tie skips the entire week because the show's tie-breaking rule may not be represented in the dataset;
5. every placement already supplied by a source agrees with descending score order.

When those checks pass, missing placements are assigned by descending score order (`1` = highest score).

### What is deliberately not derived

- `winner` is not inferred here. Winner status can involve tie-breaking or editorial/official results and remains source-backed.
- no placement is generated for incomplete-score weeks;
- no placement is generated in weeks containing tied scores;
- no known sourced placement is overwritten;
- a week with any sourced-placement mismatch is skipped rather than "fixed".

## Provenance and audit

A derived placement gets a `derived` field source pointing to this policy. The merge also writes `data/reports/derived-placements.json`, which records:

- every derived entry;
- sourced placements that were validated by the score order;
- skipped weeks and the reason they were skipped (`missing-score`, `score-tie`, `known-placement-mismatch`, or `insufficient-entries`).

The underlying scores keep their original field-level sources, so the factual inputs remain traceable to Fandom, Wikipedia, Kan or another accepted source.

Derived data is a convenience layer over sourced facts, not a replacement for source evidence. If an explicit placement is later imported, it remains authoritative and the derivation is re-evaluated on the next merge.
