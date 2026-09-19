/* check-env.mjs
 *
 * Refuses to go on when `src/environments/environment.local.ts` is missing or
 * still holds the template's YOUR_* placeholders, so `pnpm run deploy` cannot
 * publish a build that has no Firebase project to talk to. Run first by
 * the `deploy` and `deploy:hosting` scripts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const local = join(repoRoot, 'src/environments/environment.local.ts');

if (!existsSync(local)) {
  console.error(
    'src/environments/environment.local.ts is missing. Run `pnpm run firebase:setup` first (see SETUP.md).',
  );
  process.exit(1);
}

const placeholders = readFileSync(local, 'utf8').match(/YOUR_[A-Z_]+/g);
if (placeholders) {
  console.error(
    `src/environments/environment.local.ts still has placeholders (${[...new Set(placeholders)].join(', ')}).\n` +
      'Fill in your Firebase web config before deploying (see SETUP.md).',
  );
  process.exit(1);
}
