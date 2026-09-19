# Setup

The site is an Angular app deployed to GitHub Pages, with Firebase providing
authentication and the Firestore database behind it. Nothing here is needed to
*read* the site — only to run it locally or to point it at your own project.

Most of this is scripted. The short version, from a clean clone:

```bash
pnpm install
gcloud auth login                  # if you haven't already
gcloud config set project <your-project-id>

pnpm run firebase:setup            # enables APIs, Firestore, auth, writes env config
pnpm run deploy:rules              # publish firestore.rules
pnpm run admin:add you@example.com # grant yourself edit access
pnpm run seed                      # load content/ into Firestore
pnpm start
```

The rest of this file explains each step, and what to do when one misbehaves.

## Run it with no Firebase project at all

The fastest way to see the site is against the local emulators, which need no
cloud project and no credentials:

```bash
# Terminal 1 — Auth + Firestore emulators (needs Java)
pnpm run emulator:start

# Terminal 2 — the app, pointed at those emulators
pnpm run start:emulator
```

Open http://localhost:4200. To put content in it, create a user in the
Emulator UI (http://127.0.0.1:4000/auth — add a user, tick "Email verified"),
then:

```bash
pnpm run admin:add you@example.com -- --emulator
SEED_EMAIL=you@example.com SEED_PASSWORD=... pnpm run seed -- --emulator
```

## Point it at a real project

### 1. `pnpm run firebase:setup`

Takes a bare Google Cloud project and does everything the Firebase console
would have you click through:

| Step | What it does |
| --- | --- |
| APIs | Enables Firebase, Firestore, Identity Toolkit and friends |
| Firebase | Adds Firebase to the Cloud project |
| Firestore | Creates the database (default location `nam5`) |
| Web app | Registers one, or reuses the existing one |
| Config | Writes `src/environments/environment.local.ts` from its SDK config |
| Auth | Turns on Email/Password sign-in |
| Domains | Authorizes `iislucas.github.io` for sign-in |

It authenticates with the credentials from `gcloud auth login` — no service
account key, and no second `gcloud auth application-default login`.

```bash
pnpm run firebase:setup -- --dry-run          # report, change nothing
pnpm run firebase:setup -- --project=<id>     # override the project
pnpm run firebase:setup -- --location=eur3    # EU Firestore (cannot be changed later)
pnpm run firebase:setup -- --force-env        # regenerate environment.local.ts
```

Every step is idempotent — re-running reports what already existed.

The project is taken from `--project`, else `.firebaserc`, else whatever
`gcloud config get-value project` returns.

**Two things it deliberately does not do**, because both need the console:

- **Google sign-in**, which requires an OAuth consent screen and client:
  Build → Authentication → Sign-in method → Google. Email/password works
  without it.
- **Cloud Storage**, needed only to paste images into the markdown editor:
  Build → Storage → Get started. Then put your address in `storage.rules`
  (`ADMIN_EMAIL`) and run `pnpm exec firebase deploy --only storage`.

### 2. `pnpm run deploy:rules`

Publishes `firestore.rules`. Without it the project keeps Firestore's defaults
and the app reports "Could not load concepts".

Needs the Firebase CLI logged in once — `pnpm exec firebase login` — which is a
separate credential from `gcloud auth login`.

### 3. `pnpm run admin:add <email>`

Authorization on this site is exactly one document per person: `acl/<email>`
with `isAdmin: true`. This command writes it.

```bash
pnpm run admin:add you@example.com       # grant
pnpm run admin:remove them@example.com   # revoke
pnpm run admin:list                      # who has access
```

With no address, `admin:add` uses the account from `gcloud config get-value
account`. Add `-- --emulator` to target the local emulator instead.

It writes through the Firestore REST API with your gcloud credentials, which
bypass rules the same way the console does. That is on purpose:
`firestore.rules` forbids writing to `acl` from the client, so the web app can
never grant admin to anyone, no matter what it is tricked into doing.

Two things have to line up for access to work, and both are easy to miss:

- The address must match what the person **signs in with**, exactly. The
  command lowercases it, which is what Firebase puts in the token.
- Their email must be **verified** — the rules require it. Google sign-in
  verifies automatically; an email/password account needs the link clicked.

### 4. `pnpm run seed`

Writes `content/concepts/*.md` into the `concepts` collection and
`content/profile.md` into `site/profile`.

```bash
pnpm run seed -- --dry-run    # parse and report, write nothing
pnpm run seed                 # write
```

It signs in as an ordinary user and writes **through the rules**, so a
successful seed is also a check that step 3 worked. It reads `SEED_EMAIL` and
`SEED_PASSWORD` from the environment, so no password is stored in a file.

After seeding, edit in the app — Firestore is the source of truth from then on,
and re-running the seed would overwrite your edits with the files.

## Deploy to GitHub Pages

`.github/workflows/deploy-pages.yml` builds and publishes on every push to
`main`.

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Secrets and variables → Actions → Variables** — add:

   | Variable | From |
   | --- | --- |
   | `FIREBASE_API_KEY` | `firebase.apiKey` in `environment.local.ts` |
   | `FIREBASE_AUTH_DOMAIN` | `firebase.authDomain` |
   | `FIREBASE_PROJECT_ID` | `firebase.projectId` |
   | `FIREBASE_STORAGE_BUCKET` | `firebase.storageBucket` |
   | `FIREBASE_MESSAGING_SENDER_ID` | `firebase.messagingSenderId` |
   | `FIREBASE_APP_ID` | `firebase.appId` |
   | `FIREBASE_MEASUREMENT_ID` | optional |
   | `ADMIN_EMAIL` | contact address shown on the login page |

   Repository *variables*, not secrets: the build prints them into the bundle
   either way, and variables stay readable in logs, which makes a wrong value
   diagnosable.

`pnpm run firebase:setup` already authorized `iislucas.github.io` for sign-in.

The build copies `index.html` to `404.html`, which is how a static host serves
deep links like `/concepts/inner-gold`: Pages returns `404.html` for any
unmatched path, and the app's router reads the URL as usual.

## Troubleshooting

**"Could not load concepts"** — rules not deployed (step 2), or
`environment.local.ts` points at the wrong project.

**Saving fails with "this account is not an admin"** — run `pnpm run
admin:list`. If the address is there, the email is probably unverified.

**`firebase:setup` fails on `addFirebase` with 403** — the account from
`gcloud auth login` needs Owner or Editor on the project. Check with
`gcloud config get-value account`.

**`firebase:setup` cannot initialize auth** — open Build → Authentication →
Get started once in the console, then re-run it.

**Sign-in popup fails on the live site** — the domain is not authorized:
Authentication → Settings → Authorized domains.

**Deep links 404 on the live site** — the deploy did not produce `404.html`;
check the "Add SPA fallback" step in the workflow run.
