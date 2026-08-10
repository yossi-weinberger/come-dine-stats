# Source registry

The canonical machine-readable registry is [`data/sources.json`](./sources.json), and reuse/attribution notes live in [`data/ATTRIBUTION.md`](./ATTRIBUTION.md).

## Principles

1. Every imported row keeps its source URL.
2. Fandom-derived text keeps direct article attribution; Fandom states that wiki text defaults to CC BY-SA 3.0 unless otherwise noted.
3. Wayback recovery keeps both the archived snapshot and the original URL.
4. Kan is treated as the primary source for official episode identity/order, while we avoid mirroring protected media or long editorial copy.
5. The legacy project by `nemo369` is credited explicitly. No explicit license was found in that repository during this pass, so we do not copy its code/design into this project.
6. No source silently overwrites another. Conflicts are represented in field evidence.
