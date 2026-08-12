# Fandom week reconciliation

Some Fandom contestant pages contain internally inconsistent episode ranges and week names. The importer treats the explicit `(שבוע …)` label as a grouping signal and reconciles the numeric week only when there is a strong within-season consensus.

## Rule

For entries that have both `season`, `weekName` and a numeric `week` derived from the episode range:

1. Group by normalized `season + weekName`.
2. Require at least 3 entries in the group.
3. A candidate week must be supported by at least 3 entries and have strictly more support than every alternative week.
4. Only minority outliers are corrected.
5. The original contestant-page source remains in provenance and a `derived` source is added to the `week` field.
6. Every correction is written to `data/reports/fandom-week-reconciliation.json` with the previous and resolved values.

This is intentionally conservative: no correction is made from a single page, from a tie between candidate weeks, or when the group is too small.

## First known case

Season 1 contestant ענת דודי has a Fandom page whose episode range says 26–30 while its explicit week label and narrative say שבוע ירושלים. The other Jerusalem-week entries establish the canonical numeric week, so the inconsistent numeric week can be corrected without hard-coding the contestant name.
