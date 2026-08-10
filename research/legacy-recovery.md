# Legacy data recovery notes

## What the original frontend proves

Source project: https://github.com/nemo369/dine-with-me — credit: `nemo369`.

The Nuxt homepage fetched two full Strapi collections at runtime:

- `weeks?_limit=-1`
- `contestants?_limit=-1`

The public `.env.example` points to:

- `https://protected-shore-74105.herokuapp.com/`

The contestant detail page fetched `contestants/:id` and shows that the structured data included more than the first importer assumed:

- `name`
- `city`
- `session_number`
- `week.episodes`
- `week.description`
- `week.contestants_as_string`
- `order`
- `final_place`
- `score`
- `job`
- `lgbt`
- `community`
- `family_status`
- `at_his_house`
- `vegan`
- `reality`
- `cooking_style`
- `relation_type`
- `first_course`
- `main_course`
- `dessert`

This is why the new normalizer preserves legacy source evidence instead of treating it as a flat score/name list.

## Backend repository

A second public repository exists at `nemo369/-dine-with-me-be`, but it is currently an empty Git repository, so there is no database dump or Strapi source to recover there.

## Recovery strategy

`scripts/recover-legacy-wayback.ts` queries Internet Archive CDX for captures of the historical Heroku endpoints, downloads replay bodies using `id_` mode, selects the largest valid JSON-array capture, and writes a manifest that keeps both the original API URL and the archived snapshot URL.

If CDX has no API captures, the next fallback is to recover individual statically generated Nuxt contestant pages/payloads from the archived frontend and reconstruct records from those pages.
