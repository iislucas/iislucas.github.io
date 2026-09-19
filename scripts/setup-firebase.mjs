/* setup-firebase.mjs
 *
 * Turns a bare Google Cloud project into the backend this site needs, without
 * visiting the Firebase console:
 *
 *   1. enables the APIs,
 *   2. adds Firebase to the project,
 *   3. creates the Firestore database,
 *   4. registers a web app and reads its SDK config,
 *   5. writes src/environments/environment.local.ts from that config,
 *   6. turns on Email/Password sign-in,
 *   7. authorizes the domains the app is served from.
 *
 *   pnpm run firebase:setup
 *   pnpm run firebase:setup -- --project=my-project --location=eur3
 *   pnpm run firebase:setup -- --dry-run     # say what would happen, change nothing
 *   pnpm run firebase:setup -- --force-env   # overwrite an existing environment.local.ts
 *
 * Every step is idempotent: running it twice is safe, and the second run
 * reports what already existed rather than failing.
 *
 * The one thing it cannot do is enable **Google** sign-in, which needs an
 * OAuth consent screen and client that only the console can create. Email and
 * password sign-in works without it; see the note printed at the end.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  accessToken,
  activeAccount,
  api,
  bold,
  describeApiError,
  dim,
  fail,
  ok,
  repoRoot,
  requireGcloud,
  resolveProjectId,
  run,
  setQuotaProject,
  skip,
  step,
  warn,
  yellow,
} from './lib/gcp.mjs';

// APIs the app and these scripts depend on. Enabling an already-enabled API is
// a no-op, so this list is safe to re-apply.
const REQUIRED_APIS = [
  'cloudresourcemanager.googleapis.com',
  'serviceusage.googleapis.com',
  'firebase.googleapis.com',
  'firebaserules.googleapis.com',
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
];

// Domains allowed to complete a sign-in. Firebase seeds these itself on a new
// project, but the list is written back whole, so they are named here too and
// re-asserted on every run: a list that lost them heals instead of staying
// broken. `<project>.firebaseapp.com` is the one that hosts the OAuth redirect
// handler, so dropping it breaks Google sign-in everywhere at once.
const defaultAuthorizedDomains = (projectId) => [
  'localhost',
  `${projectId}.firebaseapp.com`,
  `${projectId}.web.app`,
];

// Where the site actually lives, which Firebase has no way to guess.
const EXTRA_AUTHORIZED_DOMAINS = ['iislucas.github.io'];

function parseArgs(argv) {
  const args = {
    dryRun: false,
    forceEnv: false,
    project: null,
    location: 'nam5',
    googleClientId: null,
    googleClientSecret: null,
  };
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force-env') args.forceEnv = true;
    else if (arg.startsWith('--project=')) args.project = arg.slice('--project='.length);
    else if (arg.startsWith('--location=')) args.location = arg.slice('--location='.length);
    else if (arg.startsWith('--google-client-id='))
      args.googleClientId = arg.slice('--google-client-id='.length);
    else if (arg.startsWith('--google-client-secret='))
      args.googleClientSecret = arg.slice('--google-client-secret='.length);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else fail(`Unknown argument: ${arg}`, 'Run with --help to see the options.');
  }
  return args;
}

function printHelp() {
  console.log(`
${bold('pnpm run firebase:setup')} — prepare a Google Cloud project to back this site

  --project=<id>     Project to set up. Defaults to .firebaserc, then to the
                     project gcloud is configured with.
  --location=<loc>   Firestore location, used only when creating the database.
                     Default nam5 (US multi-region); eur3 is the EU one.
                     ${yellow('This cannot be changed afterwards.')}
  --dry-run          Report what would be done, change nothing.
  --force-env        Overwrite src/environments/environment.local.ts if it
                     already exists. Without this, an existing file is kept.

  --google-client-id=<id>
  --google-client-secret=<secret>
                     Enable Google sign-in with an OAuth client you already
                     have. Without them, Google sign-in is left alone and
                     reported on — creating the client needs the console.

  --help             This message.
`);
}

/* ---------------------------------------------------------------- steps -- */

/**
 * Resolves the Identity Toolkit admin base path.
 *
 * Google documents these endpoints under `/admin/v2/`, while the published
 * discovery document lists them under `/v2/`. Rather than bet on one, probe
 * both once and remember which answers; a wrong guess would otherwise make
 * every auth step fail with a confusing 404.
 */
let identityBase = null;
async function identityToolkitBase(projectId, token) {
  if (identityBase) return identityBase;
  for (const candidate of ['admin/v2', 'v2']) {
    const probe = await api(
      `https://identitytoolkit.googleapis.com/${candidate}/projects/${projectId}/config`,
      { token },
    );
    // Anything other than "no such path" means this prefix is the live one:
    // 403 and 404-on-the-resource still tell us the route exists.
    if (probe.ok || probe.status === 403 || probe.status === 400) {
      identityBase = candidate;
      return identityBase;
    }
    if (probe.status === 404 && probe.data?.error?.message?.includes('Firebase Auth')) {
      identityBase = candidate;
      return identityBase;
    }
  }
  // Nothing answered; fall back to the documented one so the caller's own
  // error handling reports something recognisable.
  identityBase = 'admin/v2';
  return identityBase;
}

async function enableApis(projectId, dryRun) {
  step('Enabling the required APIs');
  if (dryRun) {
    skip(`would enable: ${REQUIRED_APIS.join(', ')}`);
    return;
  }
  // One call enables them all, and gcloud waits for the operation to finish.
  run('gcloud', ['services', 'enable', ...REQUIRED_APIS, `--project=${projectId}`]);
  ok(`${REQUIRED_APIS.length} APIs enabled`);
}

async function addFirebase(projectId, token, dryRun) {
  step('Adding Firebase to the project');

  const existing = await api(`https://firebase.googleapis.com/v1beta1/projects/${projectId}`, {
    token,
  });
  if (existing.ok) {
    skip('Firebase is already enabled on this project');
    return;
  }
  if (dryRun) {
    skip('would add Firebase to the project');
    return;
  }

  const result = await api(
    `https://firebase.googleapis.com/v1beta1/projects/${projectId}:addFirebase`,
    { method: 'POST', body: {}, token },
  );
  if (!result.ok) {
    fail(
      `Could not add Firebase to ${projectId}: ${describeApiError(result)}`,
      'Check that the account from `gcloud auth login` owns (or can edit) this project.',
    );
  }
  ok('Firebase enabled');
}

async function createFirestore(projectId, location, dryRun) {
  step('Creating the Firestore database');

  const listed = run(
    'gcloud',
    ['firestore', 'databases', 'list', `--project=${projectId}`, '--format=value(name)'],
    { allowFailure: true },
  );
  if (listed && listed.trim()) {
    skip('a Firestore database already exists');
    return;
  }
  if (dryRun) {
    skip(`would create a Firestore database in ${location}`);
    return;
  }

  run('gcloud', [
    'firestore',
    'databases',
    'create',
    `--location=${location}`,
    `--project=${projectId}`,
  ]);
  ok(`Firestore database created in ${location}`);
}

/**
 * Registers a web app, or reuses the first one already registered. Returns its
 * SDK config — the same values the console shows under "Your apps".
 */
async function ensureWebApp(projectId, token, dryRun) {
  step('Registering the web app');

  const listed = await api(
    `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`,
    { token },
  );
  let app = listed.ok ? (listed.data?.apps ?? [])[0] : null;

  if (app) {
    skip(`reusing the existing web app "${app.displayName ?? app.appId}"`);
  } else {
    if (dryRun) {
      skip('would register a new web app');
      return null;
    }
    const created = await api(
      `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`,
      { method: 'POST', body: { displayName: 'iislucas.github.io' }, token },
    );
    if (!created.ok) {
      fail(`Could not register a web app: ${describeApiError(created)}`);
    }

    // webApps.create returns a long-running operation; poll until it resolves.
    app = await awaitOperation(created.data, token);
    ok(`web app registered (${app.appId})`);
  }

  const config = await api(
    `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps/${app.appId}/config`,
    { token },
  );
  if (!config.ok) {
    fail(`Could not read the web app's SDK config: ${describeApiError(config)}`);
  }
  return config.data;
}

/** Polls a Firebase long-running operation until it reports done. */
async function awaitOperation(operation, token, attempts = 30) {
  if (operation?.done) return operation.response ?? operation;
  for (let i = 0; i < attempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const polled = await api(`https://firebase.googleapis.com/v1beta1/${operation.name}`, {
      token,
    });
    if (polled.ok && polled.data?.done) {
      if (polled.data.error) {
        fail(`Operation failed: ${polled.data.error.message}`);
      }
      return polled.data.response;
    }
  }
  fail('Timed out waiting for Firebase to finish registering the web app.');
}

function writeEnvironment(projectId, config, { dryRun, forceEnv, adminEmail }) {
  step('Writing src/environments/environment.local.ts');

  const target = join(repoRoot, 'src/environments/environment.local.ts');
  if (existsSync(target) && !forceEnv) {
    skip('the file already exists — keeping it (pass --force-env to overwrite)');
    return;
  }
  if (dryRun) {
    skip(`would write ${target}`);
    return;
  }

  // storageBucket is absent from the SDK config until Cloud Storage is set up.
  // Defaulting it keeps the typed contract satisfied; image uploads simply
  // fail until Storage is enabled, which the closing notes explain.
  const firebase = {
    apiKey: config.apiKey,
    authDomain: config.authDomain ?? `${projectId}.firebaseapp.com`,
    projectId: config.projectId ?? projectId,
    storageBucket: config.storageBucket ?? `${projectId}.firebasestorage.app`,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
    ...(config.measurementId ? { measurementId: config.measurementId } : {}),
  };

  const missing = Object.entries(firebase)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    fail(`The SDK config came back without: ${missing.join(', ')}.`);
  }

  const body = `/* environment.local.ts
 *
 * Generated by \`pnpm run firebase:setup\` for project ${projectId}.
 * Gitignored: these values are per-project, not per-person. They are not
 * secret — every Firebase web app ships them in its bundle — and
 * firestore.rules is what actually protects the data.
 *
 * Re-run the setup script with --force-env to regenerate this file.
 */

import { AppEnvironment } from './environment.types';

export const environment: AppEnvironment = {
  production: false,
  useEmulator: false,
  firebase: ${JSON.stringify(firebase, null, 4)
    .replace(/\n/g, '\n  ')
    .replace(/"([a-zA-Z]+)":/g, '$1:')},
  adminEmail: '${adminEmail ?? ''}',
};
`;

  writeFileSync(target, body);
  ok(`written for project ${projectId}`);
}

async function enableEmailSignIn(projectId, token, dryRun) {
  step('Enabling Email/Password sign-in');

  const base = await identityToolkitBase(projectId, token);
  const configUrl = `https://identitytoolkit.googleapis.com/${base}/projects/${projectId}/config`;
  let current = await api(configUrl, { token });

  // Firebase Auth is not provisioned until something initializes it.
  if (current.status === 404) {
    if (dryRun) {
      skip('would initialize Firebase Auth, then enable Email/Password');
      return;
    }
    const init = await api(
      `https://identitytoolkit.googleapis.com/v2/projects/${projectId}/identityPlatform:initializeAuth`,
      { method: 'POST', body: {}, token },
    );
    if (!init.ok && init.status !== 409) {
      fail(
        `Could not initialize Firebase Auth: ${describeApiError(init)}`,
        'Open Build > Authentication > Get started once in the Firebase console, then re-run this.',
      );
    }
    current = await api(configUrl, { token });
  }

  if (!current.ok) {
    // A dry run is for finding out what would happen; aborting it on a read
    // failure hides every step after this one, which is the opposite of useful.
    if (dryRun) {
      warn(
        `Could not read the auth config (${describeApiError(current)}) — continuing the dry run`,
      );
      return;
    }
    fail(`Could not read the auth config: ${describeApiError(current)}`);
  }

  if (current.data?.signIn?.email?.enabled) {
    skip('Email/Password sign-in is already on');
    return;
  }
  if (dryRun) {
    skip('would enable Email/Password sign-in');
    return;
  }

  const updated = await api(`${configUrl}?updateMask=signIn.email`, {
    method: 'PATCH',
    body: { signIn: { email: { enabled: true, passwordRequired: true } } },
    token,
  });
  if (!updated.ok) {
    fail(`Could not enable Email/Password sign-in: ${describeApiError(updated)}`);
  }
  ok('Email/Password sign-in enabled');
}

async function authorizeDomains(projectId, token, dryRun) {
  step('Authorizing the sign-in domains');

  const base = await identityToolkitBase(projectId, token);
  const configUrl = `https://identitytoolkit.googleapis.com/${base}/projects/${projectId}/config`;
  const current = await api(configUrl, { token });
  if (!current.ok) {
    warn(`Skipped: could not read the auth config (${describeApiError(current)})`);
    return;
  }

  // The PATCH below replaces the list wholesale, so anything missing from
  // `existing` is not left alone, it is deleted. A response without the field
  // therefore cannot be read as "no domains are authorized" -- treating it that
  // way would wipe localhost and the firebaseapp.com redirect handler, which
  // surfaces later as `auth/unauthorized-domain` in the browser. Bail out
  // instead, and let the console be the place that fixes it.
  const existing = current.data?.authorizedDomains;
  if (!Array.isArray(existing)) {
    warn(
      'Skipped: the auth config returned no domain list, and overwriting it would drop the defaults',
    );
    return;
  }

  const wanted = [...defaultAuthorizedDomains(projectId), ...EXTRA_AUTHORIZED_DOMAINS];
  const toAdd = wanted.filter((domain) => !existing.includes(domain));
  if (toAdd.length === 0) {
    skip('the sign-in domains are already authorized');
    return;
  }
  if (dryRun) {
    skip(`would authorize: ${toAdd.join(', ')}`);
    return;
  }

  const updated = await api(`${configUrl}?updateMask=authorizedDomains`, {
    method: 'PATCH',
    body: { authorizedDomains: [...existing, ...toAdd] },
    token,
  });
  if (!updated.ok) {
    fail(`Could not authorize ${toAdd.join(', ')}: ${describeApiError(updated)}`);
  }
  ok(`authorized ${toAdd.join(', ')}`);
}

/**
 * Reports on Google sign-in, and configures it only when given an OAuth client
 * to configure it with.
 *
 * Enabling the provider is an ordinary API call, but creating the OAuth client
 * it needs is not: the client must carry
 * `https://<project>.firebaseapp.com/__/auth/handler` as an authorized
 * redirect URI, and nothing outside the console can set one — not gcloud, not
 * the IAP OAuth client API. Asking the API to enable the provider without a
 * client produces something that reads as configured and then fails in a
 * user's browser, so this does not try: clicking the toggle once in the
 * console creates the client properly, and that is the recommended path.
 *
 * What it does do is read the current state and say which of three situations
 * you are in, including the broken middle one that is otherwise invisible.
 */
async function configureGoogleSignIn(projectId, token, { dryRun, clientId, clientSecret }) {
  step('Checking Google sign-in');

  const base = await identityToolkitBase(projectId, token);
  const configsUrl = `https://identitytoolkit.googleapis.com/${base}/projects/${projectId}/defaultSupportedIdpConfigs`;
  const googleUrl = `${configsUrl}/google.com`;

  const existing = await api(googleUrl, { token });

  if (existing.ok && existing.data?.enabled && existing.data?.clientId) {
    ok('Google sign-in is on and has an OAuth client');
    return;
  }

  // An explicit client is deterministic, so this path does configure.
  if (clientId && clientSecret) {
    if (dryRun) {
      skip('would enable Google sign-in with the client id given');
      return;
    }
    const body = { enabled: true, clientId, clientSecret };
    let result = await api(`${configsUrl}?idpId=google.com`, { method: 'POST', body, token });
    if (result.status === 409 || existing.ok) {
      result = await api(`${googleUrl}?updateMask=enabled,clientId,clientSecret`, {
        method: 'PATCH',
        body,
        token,
      });
    }
    if (!result.ok) {
      warn(`Could not enable Google sign-in: ${describeApiError(result)}`);
      printGoogleSignInInstructions(projectId);
      return;
    }
    const verify = await api(googleUrl, { token });
    if (verify.ok && verify.data?.enabled && verify.data?.clientId) {
      ok(`Google sign-in enabled (client ${verify.data.clientId.slice(0, 24)}…)`);
    } else {
      warn('Google sign-in did not come back configured.');
      printGoogleSignInInstructions(projectId);
    }
    return;
  }

  if (clientId || clientSecret) {
    warn('Both --google-client-id and --google-client-secret are needed; skipping.');
    printGoogleSignInInstructions(projectId);
    return;
  }

  // The state worth shouting about: on, but with no client behind it.
  if (existing.ok && existing.data?.enabled) {
    warn('Google sign-in is on but has no OAuth client, so it will fail in the browser.');
    printGoogleSignInInstructions(projectId);
    return;
  }

  skip('Google sign-in is off — this is the one step to do by hand');
  printGoogleSignInInstructions(projectId);
}

function printGoogleSignInInstructions(projectId) {
  console.log(
    `\n    Turn it on here — one toggle, and Firebase creates the OAuth client for you:\n` +
      `      https://console.firebase.google.com/project/${projectId}/authentication/providers\n` +
      `\n    ${dim('Only the console can create a client with the right redirect URI.')}\n` +
      `    ${dim('Already have one? pnpm run firebase:setup -- --google-client-id=... --google-client-secret=...')}\n` +
      `    ${dim('Email/password sign-in works regardless, so this never blocks setup.')}\n`,
  );
}

/* ----------------------------------------------------------------- main -- */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  requireGcloud();
  const projectId = resolveProjectId(args.project);
  setQuotaProject(projectId);
  const token = accessToken();
  const account = activeAccount();

  console.log(`\n${bold('Setting up')} ${bold(projectId)}`);
  console.log(dim(`  signed in as ${account ?? 'an unknown account'}`));
  if (args.dryRun) console.log(yellow('  --dry-run: nothing will be changed'));

  await enableApis(projectId, args.dryRun);
  await addFirebase(projectId, token, args.dryRun);
  await createFirestore(projectId, args.location, args.dryRun);
  const config = await ensureWebApp(projectId, token, args.dryRun);
  if (config) {
    writeEnvironment(projectId, config, {
      dryRun: args.dryRun,
      forceEnv: args.forceEnv,
      adminEmail: account,
    });
  }
  await enableEmailSignIn(projectId, token, args.dryRun);
  await configureGoogleSignIn(projectId, token, {
    dryRun: args.dryRun,
    clientId: args.googleClientId,
    clientSecret: args.googleClientSecret,
  });
  await authorizeDomains(projectId, token, args.dryRun);

  console.log(`\n${bold('Done.')} Next:\n`);
  console.log('  pnpm run deploy:rules              # publish firestore.rules');
  console.log(`  pnpm run admin:add ${account ?? '<your-email>'}`.trimEnd());
  console.log('  pnpm run seed                      # load content/ into Firestore');
  console.log('  pnpm start\n');
  console.log(
    dim(
      'Still manual: image uploads need Cloud Storage, which has no create API —\n' +
        `  https://console.firebase.google.com/project/${projectId}/storage`,
    ),
  );
}

main().catch((error) => {
  fail(error.message ?? String(error));
});
