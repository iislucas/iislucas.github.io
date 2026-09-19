/* environment.ts
 *
 * PURPOSE
 * - Placeholder template, COMMITTED to git.
 * - Builds replace this file with `environment.local.ts` (see angular.json
 *   `fileReplacements`), which is gitignored and holds the real values.
 *
 * USAGE
 * - `pnpm run setup:env` copies this file to `src/environments/environment.local.ts`
 *   if that file does not exist yet. Then fill in your Firebase web config.
 * - See SETUP.md for where to find those values.
 *
 * MAINTENANCE
 * - Any new config key added to `environment.local.ts` MUST be added here too,
 *   with a placeholder value, so the contract stays discoverable.
 */

import { AppEnvironment } from './environment.types';

export const environment: AppEnvironment = {
  production: false,
  useEmulator: false,
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT.firebasestorage.app',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    appId: 'YOUR_APP_ID',
  },
  adminEmail: 'YOUR_ADMIN_EMAIL',
};
