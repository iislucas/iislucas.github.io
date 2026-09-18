# Setup

The site is an Angular app deployed to GitHub Pages, with Firebase providing
authentication and the Firestore database behind it. Nothing here is needed to
*read* the site — only to run it locally or to point it at your own Firebase
project.

## 1. Install

```bash
pnpm install
```

Node 22.22.3 or newer is required (Angular 22's minimum). `node --version`.

## 2. Run against the local emulators

This needs no Firebase project at all, and is the fastest way to see the site:

```bash
# Terminal 1 — Auth + Firestore + Storage emulators (needs Java)
pnpm run emulator:start

# Terminal 2 — the app, pointed at those emulators
pnpm run start:emulator
```

Then open http://localhost:4200.

To put the contents of `content/` into the emulator, first create an admin
account in the Emulator UI (http://127.0.0.1:4000/auth — add a user, and tick
"Email verified"), add an `acl/<that-email>` document with `isAdmin: true` in
the Firestore tab, then:

```bash
SEED_EMAIL=you@example.com SEED_PASSWORD=... pnpm run seed -- --emulator
```

## 3. Point it at a real Firebase project

### 3a. Create the project

1. In the [Firebase console](https://console.firebase.google.com), create a
   project (or open an existing one).
2. **Build > Firestore Database > Create database.** Production mode: the rules
   in this repo replace the defaults in step 3d.
3. **Build > Authentication > Get started.** Enable **Email/Password**, and
   **Google** if you want the one-click sign-in.
4. **Build > Storage** — only needed if you want to paste images into the
   markdown editor.
5. **Project settings > General > Your apps > Web app.** Register one, and copy
   the `firebaseConfig` values it shows you.

### 3b. Local config

```bash
pnpm run setup:env    # creates src/environments/environment.local.ts
```

Then open that file and replace the placeholders with the values from step 3a.5.
The file is gitignored. These values are **not secret** — they ship inside the
JavaScript bundle of every Firebase web app, and `firestore.rules` is what
actually protects the data — they are simply per-project.

`adminEmail` is the contact address shown on the login page; set it to whatever
you want people to write to.

### 3c. Make yourself an admin

Authorization is one Firestore document. In the console, in Firestore, create:

- **Collection:** `acl`
- **Document ID:** your email address, exactly as it appears on your account
- **Field:** `isAdmin` (boolean) = `true`

Create it from the console rather than the app: `firestore.rules` forbids
writing to `acl` from the client, so granting admin is deliberately off the
public API.

Your account must also have a **verified email** — the rules require
`email_verified`. Google sign-in gives you this automatically; an
email/password account needs the verification link clicking first.

### 3d. Deploy the rules

```bash
pnpm exec firebase login
pnpm exec firebase use --add           # pick your project
pnpm run deploy:rules
```

Without this step Firestore keeps its default rules, and the app will show
"Could not load concepts".

### 3e. Seed the content

```bash
SEED_EMAIL=you@example.com SEED_PASSWORD=... pnpm run seed
```

This writes `content/concepts/*.md` into the `concepts` collection and
`content/profile.md` into `site/profile`. Use `--dry-run` first to see what it
would write. After seeding, edit in the app — Firestore is the source of truth
from then on, and re-running the seed would overwrite your edits with the files.

## 4. Enable image uploads (optional)

The markdown editor can upload pasted or picked images to Cloud Storage. To
allow it:

1. Open `storage.rules` and set `ADMIN_EMAIL` to your address.
2. `pnpm exec firebase deploy --only storage`

Without this, everything else still works; image *URLs* can be pasted in
regardless.

## 5. Deploy to GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` builds and publishes on
every push to `main`.

1. **Settings > Pages > Build and deployment > Source: GitHub Actions.**
2. **Settings > Secrets and variables > Actions > Variables** — add:

   | Variable | From |
   | --- | --- |
   | `FIREBASE_API_KEY` | firebaseConfig.apiKey |
   | `FIREBASE_AUTH_DOMAIN` | firebaseConfig.authDomain |
   | `FIREBASE_PROJECT_ID` | firebaseConfig.projectId |
   | `FIREBASE_STORAGE_BUCKET` | firebaseConfig.storageBucket |
   | `FIREBASE_MESSAGING_SENDER_ID` | firebaseConfig.messagingSenderId |
   | `FIREBASE_APP_ID` | firebaseConfig.appId |
   | `FIREBASE_MEASUREMENT_ID` | optional |
   | `ADMIN_EMAIL` | contact address for the login page |

   Repository *variables*, not secrets: the build prints them into the bundle
   either way, and variables are visible in logs, which makes a wrong value
   diagnosable.

3. In the Firebase console, **Authentication > Settings > Authorized domains**,
   add `iislucas.github.io`. Sign-in is refused from unlisted domains.

The build copies `index.html` to `404.html`, which is how a static host serves
deep links like `/concepts/inner-gold` — GitHub Pages returns `404.html` for
any unmatched path, and the app's router then reads the URL as usual.

## Troubleshooting

**"Could not load concepts"** — the rules are not deployed (3d), or the config
in `environment.local.ts` points at the wrong project.

**Saving fails with "this account is not an admin"** — no `acl/<your-email>`
document (3c), the address does not match exactly, or the email is unverified.

**Sign-in popup closes with an error on the live site** — `iislucas.github.io`
is not in the authorized domains list (5.3).

**Deep links 404 on the live site** — the deploy did not produce `404.html`;
check the "Add SPA fallback" step in the workflow run.
