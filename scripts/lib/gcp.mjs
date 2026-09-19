/* gcp.mjs
 *
 * Helpers for talking to Google's REST APIs using the credentials that
 * `gcloud auth login` already set up.
 *
 * Why this rather than firebase-admin or a service-account key: it needs no
 * extra dependency, no second login (`gcloud auth application-default login`
 * is a *different* credential from `gcloud auth login`), and no key file to
 * keep out of git. Everything the setup and admin scripts do is a plain HTTPS
 * call authorized by a short-lived token from the gcloud CLI.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** ANSI helpers; disabled when not a TTY or when NO_COLOR is set. */
const useColor = process.stdout.isTTY && !process.env['NO_COLOR'];
const paint = (code, s) => (useColor ? `\u001b[${code}m${s}\u001b[0m` : s);
export const bold = (s) => paint('1', s);
export const dim = (s) => paint('2', s);
export const green = (s) => paint('32', s);
export const yellow = (s) => paint('33', s);
export const red = (s) => paint('31', s);

export function step(message) {
  console.log(`\n${bold('▶')} ${bold(message)}`);
}
export function ok(message) {
  console.log(`  ${green('✔')} ${message}`);
}
export function skip(message) {
  console.log(`  ${dim('•')} ${dim(message)}`);
}
export function warn(message) {
  console.log(`  ${yellow('!')} ${message}`);
}

/** Exits with a readable message rather than a stack trace. */
export function fail(message, hint) {
  console.error(`\n${red('✘')} ${message}`);
  if (hint) console.error(`\n${hint}`);
  process.exit(1);
}

/** Runs a command, returning stdout. Throws with stderr attached on failure. */
export function run(command, args, { allowFailure = false } = {}) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (allowFailure) return null;
    const stderr = (error.stderr ?? '').toString().trim();
    throw new Error(`${command} ${args.join(' ')} failed:\n${stderr || error.message}`);
  }
}

export function requireGcloud() {
  const version = run('gcloud', ['--version'], { allowFailure: true });
  if (!version) {
    fail(
      'The gcloud CLI is not installed (or not on PATH).',
      'Install it from https://cloud.google.com/sdk/docs/install, then run `gcloud auth login`.',
    );
  }
}

/**
 * A short-lived OAuth access token for the account from `gcloud auth login`.
 * Not cached: it is valid for about an hour and the CLI refreshes it for us.
 */
export function accessToken() {
  const token = run('gcloud', ['auth', 'print-access-token'], { allowFailure: true });
  if (!token) {
    fail('Could not get a Google access token.', 'Run `gcloud auth login`, then try again.');
  }
  return token.trim();
}

/** The signed-in account's email, used as the default admin address. */
export function activeAccount() {
  const account = run('gcloud', ['config', 'get-value', 'account'], { allowFailure: true });
  const trimmed = (account ?? '').trim();
  return trimmed && trimmed !== '(unset)' ? trimmed : null;
}

/**
 * Resolves the project id, in order of specificity:
 *   --project=<id>  >  .firebaserc  >  gcloud's configured project.
 */
export function resolveProjectId(explicit) {
  if (explicit) return explicit;

  const firebaserc = join(repoRoot, '.firebaserc');
  if (existsSync(firebaserc)) {
    try {
      const parsed = JSON.parse(readFileSync(firebaserc, 'utf8'));
      const projects = parsed.projects ?? {};
      const id = projects.default ?? Object.values(projects)[0];
      if (id) return id;
    } catch {
      // A malformed .firebaserc should not stop us; fall through to gcloud.
    }
  }

  const configured = run('gcloud', ['config', 'get-value', 'project'], { allowFailure: true });
  const trimmed = (configured ?? '').trim();
  if (trimmed && trimmed !== '(unset)') return trimmed;

  fail(
    'Could not work out which project to use.',
    'Pass --project=<project-id>, or run `gcloud config set project <project-id>`.',
  );
}

/**
 * A JSON REST call against a Google API.
 *
 * Returns `{ ok, status, data }` rather than throwing, because most callers
 * here treat "already exists" as success and need to inspect the status.
 */
export async function api(url, { method = 'GET', body, token } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Required by Google APIs when the caller is a user credential rather
      // than a service account, for per-project quota attribution.
      'X-Goog-User-Project': globalThis.__gcpQuotaProject ?? '',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { ok: response.ok, status: response.status, data };
}

/** Sets the project used for quota attribution on subsequent `api` calls. */
export function setQuotaProject(projectId) {
  globalThis.__gcpQuotaProject = projectId;
}

/** Formats an API error body into something worth reading. */
export function describeApiError(result) {
  const error = result.data?.error;
  if (!error) return `HTTP ${result.status}`;
  const details = (error.details ?? [])
    .map((d) => d.reason ?? d['@type'] ?? '')
    .filter(Boolean)
    .join(', ');
  return `HTTP ${result.status}: ${error.message}${details ? ` (${details})` : ''}`;
}
