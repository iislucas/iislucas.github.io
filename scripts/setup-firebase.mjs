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

// Domains allowed to complete a sign-in. Firebase seeds localhost and its own
// two domains; this adds where the site actually lives.
const EXTRA_AUTHORIZED_DOMAINS = ['iislucas.github.io'];

function parseArgs(argv) {
  const args = { dryRun: false, forceEnv: false, project: null, location: 'nam5' };
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force-env') args.forceEnv = true;
    else if (arg.startsWith('--project=')) args.project = arg.slice('--project='.length);
    else if (arg.startsWith('--location=')) args.location = arg.slice('--location='.length);
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
  --help             This message.
`);
}

/* ---------------------------------------------------------------- steps -- */

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

  const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
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

  const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
  const current = await api(configUrl, { token });
  if (!current.ok) {
    warn(`Skipped: could not read the auth config (${describeApiError(current)})`);
    return;
  }

  const existing = current.data?.authorizedDomains ?? [];
  const toAdd = EXTRA_AUTHORIZED_DOMAINS.filter((domain) => !existing.includes(domain));
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
  await authorizeDomains(projectId, token, args.dryRun);

  console.log(`\n${bold('Done.')} Next:\n`);
  console.log('  pnpm run deploy:rules              # publish firestore.rules');
  console.log(`  pnpm run admin:add ${account ?? '<your-email>'}`.trimEnd());
  console.log('  pnpm run seed                      # load content/ into Firestore');
  console.log('  pnpm start\n');
  console.log(
    dim(
      'Not scripted, because it needs an OAuth consent screen only the console can create:\n' +
        `  Google sign-in — https://console.firebase.google.com/project/${projectId}/authentication/providers\n` +
        '  Email/password sign-in works without it.\n' +
        `  Image uploads also need Storage — https://console.firebase.google.com/project/${projectId}/storage`,
    ),
  );
}

main().catch((error) => {
  fail(error.message ?? String(error));
});
