# iislucas.github.io

My personal site and Concept Gallery, at **[iislucas.io](https://iislucas.io)**:
an Angular app on Firebase Hosting, with Firebase Auth and Firestore behind it
so the content can be edited in place rather than through a commit.

**[SETUP.md](SETUP.md)** has the setup and deployment steps.

## What's here

| Path | What it is |
| --- | --- |
| `/` | Landing page — the profile document, rendered from markdown |
| `/concepts` | The Concept Gallery, filterable by text and tag |
| `/concepts/:slug` | One concept |
| `/concepts/new`, `/concepts/:slug/edit` | Editing, admin only |
| `/profile/edit` | Editing the landing page, admin only |
| `/login` | Sign in — only needed in order to edit |

## How it works

- **Angular 22**, zoneless, standalone components, signals throughout. No
  Angular Router: routes are typed path patterns (`src/app/routing.utils.ts`,
  `routing.service.ts`) whose path variables and query params are signals, so a
  filter lives in the URL by construction. Carried over from
  [ilc-members-manager](https://github.com/iislucas/ilc-members-manager).
- **Firebase, used directly** — the `firebase` SDK, not `@angular/fire`. Auth
  and Firestore only; no Cloud Functions, no server.
- **Authorization is one document.** `acl/<email>` with `isAdmin: true` makes an
  account an admin, managed with `pnpm run admin:add|remove|list`.
  `firestore.rules` is the enforcement; the UI hiding edit buttons is only a
  courtesy. The rules forbid writing to `acl` from the client entirely, so the
  web app cannot grant admin to anyone — those commands go through the REST API
  with your own Google credentials.
- **Drafts are enforced, not hidden.** A concept with `published: false` is
  unreadable to anyone but an admin, at the rules level — the client cannot
  fetch it to hide it.
- **Content lives in Firestore**, seeded once from `content/`. See
  [content/README.md](content/README.md).
- **The markdown editor is vendored**, not written here: it comes from
  ilc-members-manager, where it is developed. `pnpm run sync:markdown-editor`
  refreshes it. See [vendor/README.md](vendor/README.md), which also lays out
  how to extract it into a package that both projects depend on.

## Commands

```bash
pnpm run firebase:setup         # prepare a Google Cloud project to back the site
pnpm run admin:add <email>      # grant someone edit access (admin:remove, admin:list)
pnpm run deploy:rules           # deploy firestore.rules
pnpm run seed                   # write content/ into Firestore (--dry-run to preview)
                                # add --via-rules to write as a signed-in user instead

pnpm start                      # dev server against your Firebase project
pnpm run start:emulator         # dev server against local emulators
pnpm run emulator:start         # the Firebase emulators
pnpm test                       # unit tests (vitest)
pnpm run build                  # production build into dist/
pnpm run sync:markdown-editor   # refresh the vendored editor from upstream
```

`firebase:setup` and the `admin:*` commands drive the Firebase and Firestore
REST APIs with the credentials from `gcloud auth login`, so setting up a
project and granting access are both scripted rather than done by clicking
through the console. Two things stay manual because they have no API —
enabling Google sign-in and creating a Storage bucket — and `firebase:setup`
reports on both rather than pretending otherwise. See [SETUP.md](SETUP.md).

## Deployment

Pushing to `main` builds and deploys to Firebase Hosting
(`.github/workflows/deploy-hosting.yml`), which serves `iislucas.io`, with
`iislucas.dev` redirecting to it. The old `iislucas.github.io` address serves a
redirect published by `.github/workflows/deploy-pages.yml`.

Serving from a domain Firebase already trusts is deliberate: sign-in is checked
against the browser's address bar, so the serving origin has to be an
authorized domain. See [SETUP.md](SETUP.md).

Content edits do not need a deploy — they are Firestore writes, live
immediately.
