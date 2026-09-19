/* set-admin.mjs
 *
 * Grants, revokes and lists admin access, which on this site is exactly one
 * Firestore document per person: `acl/<email>` with `isAdmin: true`.
 *
 *   pnpm run admin:add you@example.com
 *   pnpm run admin:remove someone@example.com
 *   pnpm run admin:list
 *   pnpm run admin:add you@example.com -- --emulator    # against the local emulator
 *
 * Note that firestore.rules forbids writing to `acl` from the client — that is
 * deliberate, so that granting admin is never something the web app can do.
 * This script writes through the Firestore REST API with the credentials from
 * `gcloud auth login`, which are project-owner credentials and bypass rules,
 * the same way the console does.
 */

import {
  accessToken,
  activeAccount,
  api,
  bold,
  describeApiError,
  dim,
  fail,
  green,
  ok,
  requireGcloud,
  resolveProjectId,
  setQuotaProject,
} from './lib/gcp.mjs';

// The emulator accepts any bearer token and ignores rules for `owner`.
const EMULATOR_HOST = '127.0.0.1:8080';
const EMULATOR_PROJECT = 'demo-iislucas-site';

function parseArgs(argv) {
  const args = { command: null, email: null, emulator: false, project: null };
  for (const arg of argv) {
    if (arg === '--emulator') args.emulator = true;
    else if (arg.startsWith('--project=')) args.project = arg.slice('--project='.length);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--')) fail(`Unknown option: ${arg}`);
    else if (!args.command) args.command = arg;
    else if (!args.email) args.email = arg;
    else fail(`Unexpected extra argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`
${bold('Admin access')} — one Firestore document per admin: acl/<email> { isAdmin: true }

  pnpm run admin:add <email>       Grant admin access
  pnpm run admin:remove <email>    Revoke it
  pnpm run admin:list              Show who currently has it

Options (after a bare \`--\`):
  --emulator        Target the local Firestore emulator instead of the project
  --project=<id>    Override the project id

The address must match the one the person signs in with, exactly. Their email
must also be verified — firestore.rules requires it — which Google sign-in
gives automatically and an email/password account gets by clicking the
verification link.
`);
}

/**
 * Validates an email well enough to catch the mistakes that matter here: a
 * typo'd or shell-mangled address silently creates an ACL document nobody can
 * ever match, and the symptom ("saving fails") points nowhere near the cause.
 */
function normalizeEmail(email) {
  if (!email) {
    fail('No email address given.', 'Usage: pnpm run admin:add <email>');
  }
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    fail(`"${email}" does not look like an email address.`);
  }
  // Firestore document ids cannot contain a forward slash, and must not be
  // "." or "..". No real address can be those, but be explicit about it.
  if (trimmed.includes('/')) {
    fail(`"${email}" cannot be used as a document id (it contains a slash).`);
  }
  return trimmed;
}

/** Base URL and auth for either the emulator or the real project. */
function target(args) {
  if (args.emulator) {
    const projectId = args.project ?? EMULATOR_PROJECT;
    return {
      projectId,
      token: 'owner',
      base: `http://${EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents`,
      label: `the emulator (${projectId})`,
    };
  }
  requireGcloud();
  const projectId = resolveProjectId(args.project);
  setQuotaProject(projectId);
  return {
    projectId,
    token: accessToken(),
    base: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`,
    label: projectId,
  };
}

async function addAdmin({ base, token, label }, email) {
  const url = `${base}/acl/${encodeURIComponent(email)}?updateMask.fieldPaths=isAdmin`;
  const result = await api(url, {
    method: 'PATCH',
    body: { fields: { isAdmin: { booleanValue: true } } },
    token,
  });
  if (!result.ok) {
    fail(
      `Could not grant admin to ${email}: ${describeApiError(result)}`,
      result.status === 403
        ? 'The signed-in account needs edit access to the project. Check `gcloud config get-value account`.'
        : undefined,
    );
  }
  ok(`${green(email)} is now an admin on ${label}`);
  console.log(
    dim(
      '\n  They must sign in with this exact address, and their email must be verified.\n' +
        '  Google sign-in verifies automatically; email/password needs the link clicked.',
    ),
  );
}

async function removeAdmin({ base, token, label }, email) {
  const url = `${base}/acl/${encodeURIComponent(email)}`;

  // Firestore's DELETE succeeds whether or not the document exists, so ask
  // first — otherwise removing a typo'd address reports a reassuring success
  // while the real admin document is still sitting there.
  const existing = await api(url, { token });
  if (existing.status === 404) {
    ok(`${email} was not an admin on ${label} — nothing to do`);
    return;
  }

  const result = await api(url, { method: 'DELETE', token });
  if (!result.ok) {
    fail(`Could not revoke admin from ${email}: ${describeApiError(result)}`);
  }
  ok(`${email} is no longer an admin on ${label}`);
}

async function listAdmins({ base, token, label }) {
  const result = await api(`${base}/acl?pageSize=100`, { token });
  if (!result.ok) {
    fail(`Could not list admins: ${describeApiError(result)}`);
  }

  const documents = result.data?.documents ?? [];
  const admins = documents
    .map((doc) => ({
      email: decodeURIComponent(doc.name.split('/').pop()),
      isAdmin: doc.fields?.isAdmin?.booleanValue === true,
    }))
    .filter((entry) => entry.isAdmin);

  console.log(`\n${bold(`Admins on ${label}`)}`);
  if (admins.length === 0) {
    console.log(dim('  (none yet — run `pnpm run admin:add <email>`)'));
  } else {
    for (const admin of admins) console.log(`  ${green('•')} ${admin.email}`);
  }

  // Entries that exist but are not admins are worth surfacing: they are the
  // usual explanation for "I granted access but it still will not save".
  const inactive = documents.length - admins.length;
  if (inactive > 0) {
    console.log(dim(`\n  ${inactive} other acl document(s) exist without isAdmin: true`));
  }
  console.log();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.command) {
    printHelp();
    return;
  }

  const command = args.command;
  if (!['add', 'remove', 'list'].includes(command)) {
    fail(`Unknown command "${command}".`, 'Expected one of: add, remove, list.');
  }

  const destination = target(args);

  if (command === 'list') {
    await listAdmins(destination);
    return;
  }

  // `pnpm run admin:add` with no address is nearly always "make me an admin".
  const email = normalizeEmail(
    args.email ?? (command === 'add' && !args.emulator ? activeAccount() : null),
  );

  if (command === 'add') await addAdmin(destination, email);
  else await removeAdmin(destination, email);
}

main().catch((error) => {
  fail(error.message ?? String(error));
});
