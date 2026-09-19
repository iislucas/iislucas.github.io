/* sync-markdown-editor.mjs
 *
 * Refreshes the vendored markdown editor from its upstream repository.
 *
 *   pnpm run sync:markdown-editor              # sync to the upstream default branch
 *   pnpm run sync:markdown-editor -- --check   # report drift, change nothing
 *   pnpm run sync:markdown-editor -- --ref abc123
 *
 * What it does: shallow-clones the upstream repo into a temp directory, copies
 * the paths listed in vendor/markdown-editor.json over the local ones, and
 * records the commit it copied from. It never commits and never pushes — the
 * changes land in your working tree so you can read the diff before keeping
 * them. See vendor/README.md for why this exists and what replaces it.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(repoRoot, 'vendor/markdown-editor.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const refIndex = argv.indexOf('--ref');
const ref = refIndex !== -1 ? argv[refIndex + 1] : manifest.ref;

if (refIndex !== -1 && !ref) {
  console.error('--ref needs a value (a branch name, tag or commit sha).');
  process.exit(1);
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const workDir = mkdtempSync(join(tmpdir(), 'markdown-editor-sync-'));
try {
  console.log(`Fetching ${manifest.upstream} at ${ref}...`);
  // A blobless clone keeps this quick on a large repo while still allowing an
  // arbitrary sha to be checked out.
  git(['clone', '--filter=blob:none', '--no-checkout', manifest.upstream, workDir]);
  git(['checkout', ref], workDir);
  const commit = git(['rev-parse', 'HEAD'], workDir).trim();
  const subject = git(['log', '-1', '--pretty=%s'], workDir).trim();

  console.log(`Upstream commit ${commit.slice(0, 10)}  ${subject}`);
  if (manifest.syncedCommit && manifest.syncedCommit !== commit) {
    console.log(`Currently vendored: ${manifest.syncedCommit.slice(0, 10)}`);
  } else if (manifest.syncedCommit === commit) {
    console.log('Already up to date with this commit.');
  }

  if (checkOnly) {
    console.log('\n--check: nothing was modified.');
    process.exit(manifest.syncedCommit === commit ? 0 : 1);
  }

  for (const path of manifest.paths) {
    const source = join(workDir, path.from);
    if (!existsSync(source)) {
      console.error(`Upstream is missing ${path.from} — aborting without changing anything.`);
      process.exit(1);
    }
    cpSync(source, join(repoRoot, path.to), { recursive: true });
    console.log(`  copied ${path.from}`);
  }

  writeFileSync(
    manifestPath,
    JSON.stringify(
      { ...manifest, ref, syncedCommit: commit, syncedAt: new Date().toISOString() },
      null,
      2,
    ) + '\n',
  );

  console.log(
    '\nDone. Review with `git diff`, then run `pnpm test` and `pnpm build` before committing:\n' +
      'upstream changes can rename inputs the app passes in.',
  );
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
