# Seed content

The files here are the source of truth for the _initial_ contents of the site.
They are seeded into Firestore with `pnpm run seed`, which writes:

- `content/profile.md` -> the `site/profile` document (the landing page)
- `content/gallery-intro.md` -> the blurb at the top of the Concept Gallery
- `content/favourite-papers.md` -> the favourite papers shown on the landing page
- `content/concepts/*.md` -> one document each in the `concepts` collection

The last three all end up as fields of `site/profile`; they are separate files
only because they are separate pieces of writing.

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

## Favourite papers

`content/favourite-papers.md` is one `## <title>` per paper, each followed
_immediately_ by whichever of these it has, then a blank line and the markdown
saying why it is a favourite:

```
Anything before the first `##` is the blurb shown above the list.

## Patchscopes
year: 2024
arxiv: 2401.06102
scholar: 8AbLer7MMksC
url: https://pair.withgoogle.com/explorables/patchscopes/

This is basically a kind of neuroscience "brain survey" ...
```

The first line that is not one of those four keys starts the body, so the
metadata cannot be separated from the title by a blank line.

Each handle produces a link, and the first one a paper has is what its title
links to:

- `arxiv` -> **alphaXiv** (`alphaxiv.org/abs/<id>`), which is the arXiv paper
  with notes and discussion on top of it. A full arXiv or alphaXiv URL works
  here too; it is reduced to the id.
- `scholar` -> the paper's **Google Scholar** entry, built from this id and the
  `scholarUserId` in `profile.md`. It is the part after the colon in Scholar's
  `citation_for_view=<user>:<citation>`; pasting the whole citation URL works.
- `url` -> anything else — a project page or an explorable — labelled with its
  host.

All three are optional. After seeding, papers are edited in the app on
`/profile/edit`, like the rest of the profile.
