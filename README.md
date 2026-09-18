# iislucas.github.io

My personal site and Concept Gallery: an Angular app on GitHub Pages, with
Firebase Auth and Firestore behind it so the content can be edited in place
rather than through a commit.

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
  account an admin. `firestore.rules` is the enforcement; the UI hiding edit
  buttons is only a courtesy.
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
pnpm start                      # dev server against your Firebase project
pnpm run start:emulator         # dev server against local emulators
pnpm run emulator:start         # the Firebase emulators
pnpm test                       # unit tests (vitest)
pnpm run build                  # production build into dist/
pnpm run seed -- --dry-run      # show what seeding would write
pnpm run seed                   # write content/ into Firestore
pnpm run deploy:rules           # deploy firestore.rules
pnpm run sync:markdown-editor   # refresh the vendored editor from upstream
```

## Deployment

Pushing to `main` builds and publishes to GitHub Pages
(`.github/workflows/deploy-pages.yml`). Content edits do not need a deploy —
they are Firestore writes, live immediately.
