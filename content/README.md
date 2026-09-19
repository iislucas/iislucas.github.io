# Seed content

The files here are the source of truth for the *initial* contents of the site.
They are seeded into Firestore with `pnpm run seed`, which writes:

- `content/profile.md` -> the `site/profile` document (the landing page)
- `content/concepts/*.md` -> one document each in the `concepts` collection

After seeding, editing happens **in the app** (sign in, then use the edit
buttons) — Firestore is the live source of truth from then on. Re-running the
seed script overwrites the documents it covers, so only re-run it if you want
to reset those concepts back to the text in this folder.

## File format

Each file starts with a small YAML-ish front-matter block, delimited by `---`:

```
---
slug: my-concept
title: My Concept
summary: One line shown on the gallery card.
tags: [emotions, mathematics]
order: 10
published: true
acknowledgement: Thanks to conversations with ...
---

The markdown body of the concept goes here.
```

`slug` becomes the Firestore document id and the URL (`/concepts/my-concept`).
`published: false` keeps a concept visible only to a signed-in admin — that is
what the "In Progress" section of the original document maps onto.
