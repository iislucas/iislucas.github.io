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
 * Auth: the script signs in with email and password, because Firestore rules
 * (not an admin key) are what authorize the writes. It reads SEED_EMAIL and
 * SEED_PASSWORD from the environment, so no credential is ever written to a
 * file here. That account needs an `acl/<email>` document with isAdmin: true —
 * exactly the same check the app makes.
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
      '\nSet SEED_EMAIL and SEED_PASSWORD to an admin account before seeding, e.g.\n' +
        '  SEED_EMAIL=you@example.com SEED_PASSWORD=... pnpm run seed\n' +
        'That account needs an acl/<email> document with isAdmin: true (see SETUP.md).',
    );
    process.exit(1);
  }
  await signInWithEmailAndPassword(auth, email, password);
  console.log(`\nSigned in as ${email}.`);

  for (const concept of concepts) {
    const { slug, ...fields } = concept;
    await setDoc(doc(db, 'concepts', slug), fields);
    console.log(`  wrote concepts/${slug}`);
  }
  await setDoc(doc(db, 'site', 'profile'), profile);
  console.log('  wrote site/profile');
  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
