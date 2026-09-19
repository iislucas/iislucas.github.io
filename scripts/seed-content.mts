/* seed-content.ts
 *
 * Loads the markdown in `content/` into Firestore: one document per concept
 * plus the landing-page profile. Run it once to populate a fresh project;
 * after that, edit in the app.
 *
 *   pnpm run seed                    # against the project in environment.local.ts
 *   pnpm run seed -- --emulator      # against a running local emulator
 *   pnpm run seed -- --dry-run       # parse and report, write nothing
 *
 * There are two ways it can authenticate, and it picks between them so that
 * the common case needs no password:
 *
 *   via gcloud (the default) — writes through the Firestore REST API with the
 *     credentials from `gcloud auth login`, the same way scripts/set-admin.mjs
 *     does. Nothing to type, and it works for an account that signs in with
 *     Google and so has no password at all. These are project-owner
 *     credentials, so they bypass the security rules.
 *
 *   via the rules (`--via-rules`, or by setting SEED_EMAIL and SEED_PASSWORD)
 *     — signs in as an ordinary user with the client SDK, so every write is
 *     checked by firestore.rules. Slower and needs a password, but a
 *     successful run also proves the account's `acl/<email>` document is
 *     right. Worth using once after setting a project up.
 *
 * Credentials are never read from or written to a file here: the password
 * path takes SEED_EMAIL and SEED_PASSWORD from the environment, and the
 * gcloud path uses a short-lived token from the CLI.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// The firebase SDK is imported lazily inside main(), so that `--dry-run` can
// parse and report on the content files in a checkout with no node_modules.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(repoRoot, 'content');
const args = new Set(process.argv.slice(2));
const useEmulator = args.has('--emulator');
const dryRun = args.has('--dry-run');
// An explicit --via-rules, or a password in the environment, selects the
// rules-checked path; otherwise gcloud credentials are used.
const viaRules =
  args.has('--via-rules') || (!!process.env['SEED_EMAIL'] && !!process.env['SEED_PASSWORD']);

interface FrontMatter {
  [key: string]: string | string[] | boolean | number | { label: string; url: string }[];
}

/**
 * Parses the small front-matter dialect used by `content/`: `key: value` pairs,
 * `[a, b]` inline lists, and `- label:` / `  url:` blocks for profile links.
 * This is deliberately not a full YAML parser — the files are ours, the shapes
 * are fixed, and a dependency for this would be more surface than it is worth.
 */
function parseFrontMatter(raw: string): { data: FrontMatter; body: string } {
  if (!raw.startsWith('---')) return { data: {}, body: raw.trim() };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: raw.trim() };

  const header = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trim();
  const data: FrontMatter = {};
  const links: { label: string; url: string }[] = [];
  let inLinks = false;

  for (const line of header.split('\n')) {
    if (line.trim() === '') continue;

    if (inLinks && /^\s+-?\s*(label|url):/.test(line)) {
      const [, key, value] = line.match(/^\s+-?\s*(label|url):\s*(.*)$/)!;
      if (key === 'label') links.push({ label: unquote(value), url: '' });
      else if (links.length > 0) links[links.length - 1].url = unquote(value);
      continue;
    }

    const match = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;

    if (key === 'links') {
      inLinks = true;
      continue;
    }
    inLinks = false;

    const value = rawValue.trim();
    if (value === 'true' || value === 'false') data[key] = value === 'true';
    else if (value !== '' && !Number.isNaN(Number(value)) && /^-?\d+$/.test(value))
      data[key] = Number(value);
    else if (value.startsWith('[') && value.endsWith(']'))
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s.trim()))
        .filter((s) => s !== '');
    else data[key] = unquote(value);
  }

  if (links.length > 0) data['links'] = links;
  return { data, body };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}


/**
 * Loads an Angular environment file from Node.
 *
 * These files are ordinary TypeScript modules with an extensionless relative
 * import of their types, which Node's type stripping will not resolve (it
 * requires explicit extensions) and which the Angular bundler resolves fine.
 * Rather than contorting the app's source to suit this script, bundle the file
 * with esbuild — already present as a build dependency — and import the result.
 */
async function loadEnvironment(path: string): Promise<{ firebase: Record<string, string> }> {
  if (!existsSync(path)) {
    console.error(
      `Missing ${path}. Run \`pnpm run setup:env\` and fill in your Firebase config first (see SETUP.md).`,
    );
    process.exit(1);
  }
  const esbuild = await import('esbuild');
  const result = await esbuild.build({
    entryPoints: [path],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  const dataUrl =
    'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64');
  const module = await import(dataUrl);
  return module.environment;
}

async function main() {
  const now = new Date().toISOString();

  // --- Parse concepts -------------------------------------------------------
  const conceptsDir = join(contentDir, 'concepts');
  const conceptFiles = readdirSync(conceptsDir).filter((f) => f.endsWith('.md'));
  const concepts = conceptFiles.map((file) => {
    const { data, body } = parseFrontMatter(readFileSync(join(conceptsDir, file), 'utf8'));
    const slug = (data['slug'] as string) || basename(file, '.md');
    return {
      slug,
      title: (data['title'] as string) ?? '',
      summary: (data['summary'] as string) ?? '',
      markdown: body,
      acknowledgement: (data['acknowledgement'] as string) ?? '',
      tags: (data['tags'] as string[]) ?? [],
      imageUrl: (data['imageUrl'] as string) ?? '',
      order: (data['order'] as number) ?? 0,
      published: data['published'] === true,
      created: now,
      lastUpdated: now,
    };
  });

  // --- Parse profile --------------------------------------------------------
  const { data: profileData, body: profileBody } = parseFrontMatter(
    readFileSync(join(contentDir, 'profile.md'), 'utf8'),
  );
  const galleryIntro = readFileSync(join(contentDir, 'gallery-intro.md'), 'utf8').trim();
  const profile = {
    name: (profileData['name'] as string) ?? '',
    tagline: (profileData['tagline'] as string) ?? '',
    bioMarkdown: profileBody,
    photoUrl: (profileData['photoUrl'] as string) ?? '',
    galleryIntroMarkdown: galleryIntro,
    links: (profileData['links'] as { label: string; url: string }[]) ?? [],
    lastUpdated: now,
  };

  console.log(
    `Parsed ${concepts.length} concepts ` +
      `(${concepts.filter((c) => c.published).length} published, ` +
      `${concepts.filter((c) => !c.published).length} draft) and the profile.`,
  );
  for (const c of concepts) {
    console.log(`  ${c.published ? ' ' : '*'} ${c.slug.padEnd(34)} ${c.title}`);
  }
  console.log('  (* = draft, visible only when signed in as an admin)');

  if (dryRun) {
    console.log('\n--dry-run: nothing was written.');
    return;
  }

  // --- Write ----------------------------------------------------------------
  const documents: { path: string; fields: Record<string, unknown> }[] = [
    ...concepts.map(({ slug, ...fields }) => ({ path: `concepts/${slug}`, fields })),
    { path: 'site/profile', fields: profile },
  ];

  if (viaRules) {
    await writeViaRules(documents);
  } else {
    await writeViaGcloud(documents);
  }

  console.log('\nDone.');
  process.exit(0);
}

/**
 * Writes with the client SDK, signed in as an ordinary user, so firestore.rules
 * checks every write. Needs a password, which an account that only ever signs
 * in with Google will not have.
 */
async function writeViaRules(documents: { path: string; fields: Record<string, unknown> }[]) {
  const { initializeApp } = await import('firebase/app');
  const { connectAuthEmulator, getAuth, signInWithEmailAndPassword } = await import(
    'firebase/auth'
  );
  const { connectFirestoreEmulator, doc, getFirestore, setDoc } = await import(
    'firebase/firestore'
  );

  const environment = await loadEnvironment(
    useEmulator
      ? join(repoRoot, 'src/environments/environment.emulator.ts')
      : join(repoRoot, 'src/environments/environment.local.ts'),
  );

  const app = initializeApp(environment.firebase);
  const db = getFirestore(app);
  const auth = getAuth(app);

  if (useEmulator) {
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }

  const email = process.env['SEED_EMAIL'];
  const password = process.env['SEED_PASSWORD'];
  if (!email || !password) {
    console.error(
      '\n--via-rules needs an account to sign in as:\n' +
        '  SEED_EMAIL=you@example.com SEED_PASSWORD=... pnpm run seed -- --via-rules\n' +
        'That account needs an acl/<email> document with isAdmin: true, and a verified\n' +
        'email address. Drop --via-rules to seed with your gcloud credentials instead,\n' +
        'which needs no password (see SETUP.md).',
    );
    process.exit(1);
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    console.error(`\nCould not sign in as ${email}: ${code || error}`);
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      console.error(
        'If this account signs in with Google it has no password. Drop --via-rules\n' +
          'and SEED_PASSWORD to seed with your gcloud credentials instead.',
      );
    }
    process.exit(1);
  }
  console.log(`\nSigned in as ${email}; writing through firestore.rules.`);

  for (const document of documents) {
    const [collection, docId] = document.path.split('/');
    await setDoc(doc(db, collection, docId), document.fields);
    console.log(`  wrote ${document.path}`);
  }
}

/**
 * Writes through the Firestore REST API with the credentials from
 * `gcloud auth login` — no password, and no dependency on the account having
 * one. These are project-owner credentials, so the rules are bypassed; that is
 * the same authority the Firebase console writes with.
 */
async function writeViaGcloud(documents: { path: string; fields: Record<string, unknown> }[]) {
  const { accessToken, api, describeApiError, requireGcloud, resolveProjectId, setQuotaProject } =
    await import('./lib/gcp.mjs');

  let base: string;
  let token: string;
  let label: string;

  if (useEmulator) {
    const projectId = 'demo-iislucas-site';
    base = `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`;
    token = 'owner';
    label = `the emulator (${projectId})`;
  } else {
    requireGcloud();
    const projectId = resolveProjectId(null);
    setQuotaProject(projectId);
    base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    token = accessToken();
    label = projectId;
  }

  console.log(`\nWriting to ${label} with your gcloud credentials.`);

  for (const document of documents) {
    const result = await api(`${base}/${document.path}`, {
      method: 'PATCH',
      body: { fields: toFirestoreFields(document.fields) },
      token,
    });
    if (!result.ok) {
      console.error(`\nFailed to write ${document.path}: ${describeApiError(result)}`);
      if (result.status === 403) {
        console.error(
          'The signed-in account needs edit access to the project.\n' +
            'Check `gcloud config get-value account` and `gcloud auth login`.',
        );
      }
      process.exit(1);
    }
    console.log(`  wrote ${document.path}`);
  }
}

/**
 * Converts a plain object into Firestore's REST representation, where every
 * value is tagged with its type. Only the shapes this content actually uses
 * are handled — strings, numbers, booleans, arrays and nested objects — and
 * anything else throws rather than being silently written as the wrong type.
 */
function toFirestoreFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = toFirestoreValue(value);
  }
  return out;
}

function toFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    // Firestore distinguishes the two, and the REST form carries an integer as
    // a string. `order` is the only number here, but keep both paths honest.
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: toFirestoreFields(value as Record<string, unknown>) } };
  }
  throw new Error(`Cannot convert a ${typeof value} to a Firestore value.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
