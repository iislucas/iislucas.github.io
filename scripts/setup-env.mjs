/* setup-env.mjs
 *
 * Creates `src/environments/environment.local.ts` from the committed
 * `environment.ts` template when it is missing, so that a fresh checkout can
 * build without hand-copying files. Run automatically by `pnpm start` and
 * `pnpm build` (see the `prestart` / `prebuild` scripts).
 *
 * A placeholder config builds, but does not work against a real project, so
 * `firebase:setup` fills it in and deploys run from a checkout that has it.
 */

import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const template = join(repoRoot, 'src/environments/environment.ts');
const local = join(repoRoot, 'src/environments/environment.local.ts');

if (existsSync(local)) {
  process.exit(0);
}

copyFileSync(template, local);
console.log(
  [
    'Created src/environments/environment.local.ts from the template.',
    'It still holds PLACEHOLDER values — the app will not connect to Firebase',
    'until you fill in your web config. See SETUP.md.',
  ].join('\n'),
);
