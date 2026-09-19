/* lock-signups.mjs
 *
 * Switches off creating new accounts on the Firebase project, so that nobody
 * but the accounts that already exist can sign in — with Google or with a
 * password. This is the enforcement behind the site's "sign-in is for the
 * editor only"; the web app hiding its sign-in link is only a courtesy.
 *
 *   pnpm run auth:lock-signups                # stop new accounts being created
 *   pnpm run auth:lock-signups -- --unlock    # allow them again
 *   pnpm run auth:lock-signups -- --status    # report, change nothing
 *   pnpm run auth:lock-signups -- --project=my-project
 *
 * IMPORTANT: sign in to the site once, as the editor, BEFORE locking. The lock
 * refuses any account it has not seen before, including yours — if that
 * happens, `--unlock`, sign in, and lock again.
 *
 * It is the Identity Platform setting `client.permissions.disabledUserSignup`,
 * which the Firebase console shows as Authentication > Settings > User actions
 * > "Enable create (sign-up)". Uses your `gcloud auth login` credentials.
 */

import {
  accessToken,
  api,
  bold,
  describeApiError,
  fail,
  identityToolkitBase,
  ok,
  requireGcloud,
  resolveProjectId,
  setQuotaProject,
  skip,
  step,
} from './lib/gcp.mjs';

const argv = process.argv.slice(2);
const unlock = argv.includes('--unlock');
const statusOnly = argv.includes('--status');
const projectArg = argv.find((a) => a.startsWith('--project='))?.slice('--project='.length) ?? null;

async function main() {
  requireGcloud();
  const projectId = resolveProjectId(projectArg);
  setQuotaProject(projectId);
  const token = accessToken();

  const base = await identityToolkitBase(projectId, token);
  const configUrl = `https://identitytoolkit.googleapis.com/${base}/projects/${projectId}/config`;

  step(`Account creation on ${bold(projectId)}`);
  const current = await api(configUrl, { token });
  if (!current.ok) fail(`Could not read the auth config: ${describeApiError(current)}`);

  const locked = current.data?.client?.permissions?.disabledUserSignup === true;
  if (statusOnly) {
    ok(locked ? 'locked: new accounts cannot be created' : 'open: anyone can create an account');
    return;
  }
  if (locked === !unlock) {
    skip(locked ? 'already locked' : 'already open');
    return;
  }

  const updated = await api(`${configUrl}?updateMask=client.permissions.disabledUserSignup`, {
    method: 'PATCH',
    body: { client: { permissions: { disabledUserSignup: !unlock } } },
    token,
  });
  if (!updated.ok) fail(`Could not change the setting: ${describeApiError(updated)}`);
  ok(unlock ? 'unlocked: new accounts can be created' : 'locked: new accounts cannot be created');
}

main().catch((error) => fail(error.message ?? String(error)));
