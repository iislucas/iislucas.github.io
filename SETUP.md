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

No passwords anywhere: every command above authenticates with the credentials
`gcloud auth login` already left behind.

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

Open http://localhost:4200. To put content in it:

```bash
pnpm run seed -- --emulator
```

That needs no account at all against the emulator. To exercise the rules
locally instead, create a verified user in the Emulator UI
(http://127.0.0.1:4000/auth), then:

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
| Auth | Turns on Email/Password sign-in; reports on Google sign-in |
| Domains | Authorizes the site's domains, re-asserts the defaults, reports what it could not set |

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

#### Google sign-in — the one manual step

**Turn it on in the console, once:**
Build → Authentication → Sign-in method → **Google** → enable → save.

That single toggle also creates the OAuth client behind it, which is the part
that cannot be scripted. The client has to carry
`https://<project>.firebaseapp.com/__/auth/handler` as an authorized redirect
URI, and nothing outside the console can set one — not gcloud, and not the IAP
OAuth client API, which creates clients but will not let you set redirect URIs.

`firebase:setup` deliberately does not try to enable it for you. The API would
accept a provider with no client behind it, and the result reads as configured
in the console while failing in the browser — a worse place to end up than an
honest manual step. What the script does instead is *report*, so you always
know which of three states you are in:

| What it prints | Meaning |
| --- | --- |
| `Google sign-in is on and has an OAuth client` | Nothing to do |
| `Google sign-in is off — this is the one step to do by hand` | Click the toggle |
| `on but has no OAuth client, so it will fail in the browser` | Broken; re-save it in the console |

If you already have a suitable OAuth client, it can be applied without the
console:

```bash
pnpm run firebase:setup -- --google-client-id=... --google-client-secret=...
```

**Email/password sign-in works regardless**, so this never blocks setup — the
site is fully usable before you get to it.

#### Cloud Storage

Needed only to paste images into the markdown editor, and it has no create API:
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

By default it writes with your **gcloud credentials**, so there is no password
to supply — which matters if you sign in with Google, because then your
account has no password at all. Those are project-owner credentials, the same
authority the Firebase console writes with, so they bypass the security rules.

There is a second mode that goes **through** the rules instead:

```bash
SEED_EMAIL=you@example.com SEED_PASSWORD=... pnpm run seed -- --via-rules
```

This signs in as an ordinary user, so every write is checked by
`firestore.rules` — which makes a successful run a proof that step 3 worked.
Worth doing once when setting a project up, if the account has a password.
Setting `SEED_EMAIL` and `SEED_PASSWORD` selects this mode on its own.

After seeding, edit in the app — Firestore is the source of truth from then on,
and re-running the seed would overwrite your edits with the files.

## Deploy

The site is served from **Firebase Hosting** at `iislucas.io`, with
`iislucas.dev` redirecting to it. `iislucas.github.io` stays alive as a
redirect too.

Firebase Hosting rather than GitHub Pages for one concrete reason: Firebase
Authentication checks a sign-in against the browser's address bar, so wherever
the site is served from has to be an authorized domain. Serving it from a
domain Firebase already knows about removes a whole class of
`auth/unauthorized-domain` failure, and Hosting does real SPA rewrites, so
there is no `404.html` copy to maintain.

| Workflow | What it does |
| --- | --- |
| `deploy-hosting.yml` | Builds the app and deploys it to Firebase Hosting on every push to `main` |
| `deploy-pages.yml` | Publishes `pages-redirect/index.html` to GitHub Pages, forwarding the old address |

### 1. Repository variables

**Settings → Secrets and variables → Actions → Variables** — add:

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
diagnosable. The build fails with the names of any that are missing.

Moving to Firebase Hosting does not remove this step. Hosting can serve its own
config at `/__/firebase/init.js`, but the app reads config at build time, and
`adminEmail` is not part of a Firebase config at all.

### 2. Deploy credential

**Settings → Secrets and variables → Actions → Secrets** — add
`FIREBASE_SERVICE_ACCOUNT`, the full JSON key of a service account with the
**Firebase Hosting Admin** role:

```bash
gcloud iam service-accounts create github-deploy --project=<project>
gcloud projects add-iam-policy-binding <project> \
  --member=serviceAccount:github-deploy@<project>.iam.gserviceaccount.com \
  --role=roles/firebasehosting.admin
gcloud iam service-accounts keys create key.json \
  --iam-account=github-deploy@<project>.iam.gserviceaccount.com
```

Paste the contents of `key.json` as the secret value, then delete the local
file. This one **is** secret, unlike the variables above.

### 3. Custom domains

In the console, Hosting → **Add custom domain**:

1. Add `iislucas.io` as the primary domain.
2. Add `iislucas.dev` and choose the **redirect** option, pointing it at
   `iislucas.io`, so the two do not compete as duplicate content.

Firebase gives you the A / TXT records to set at your registrar, and issues the
certificates once they resolve. Propagation is usually minutes but can take
longer.

### 4. Authorize the domains for sign-in

A custom domain that Firebase serves is still not automatically allowed to
*complete a sign-in*. Run:

```bash
pnpm run firebase:setup
```

It asserts `iislucas.io`, `iislucas.dev` and `iislucas.github.io` alongside the
defaults, reads the list back to confirm, and prints the console link for
anything it could not set.

### 5. GitHub Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

`iislucas.github.io` cannot be pointed at Firebase Hosting with a custom domain,
because GitHub controls DNS for `github.io`. Keeping the old address working
therefore means serving a redirect from Pages, which is all `deploy-pages.yml`
does now — no build, no config, no secrets.

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

**Google sign-in fails with `auth/unauthorized-domain`** — the address the
page is served from is missing from Authentication → Settings → Authorized
domains. Re-run `pnpm run firebase:setup`: it adds the ones it can and prints
the console link for anything it could not.

The check is against the browser's address bar, so the domain to add is the one
you are actually on: `localhost` for `pnpm start`, `iislucas.io` for the live
site. `<project>.firebaseapp.com` must be there too — it hosts the OAuth
redirect handler, so without it Google sign-in fails from every address at
once, while password sign-in carries on working. Note that Firebase matches on
hostname only, and seeds `localhost` but not `127.0.0.1`.

**Deep links 404 on the live site** — the `rewrites` entry in `firebase.json`
is what sends every unmatched path to `index.html`; check it survived, and that
the deploy ran against the site you are looking at.

**A push to `main` did not update the site** — the two workflows have separate
triggers. `deploy-hosting.yml` runs on every push; `deploy-pages.yml` only runs
when the redirect itself changes, because nothing else affects it.
