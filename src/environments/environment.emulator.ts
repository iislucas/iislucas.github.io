/* environment.emulator.ts
 *
 * Used by `pnpm start:emulator` / `ng build --configuration emulator`. Points
 * the app at the local Firebase Emulator Suite, so no real project is touched.
 * The `demo-` project id prefix tells the emulators to run fully offline.
 */

import { AppEnvironment } from './environment.types';

export const environment: AppEnvironment = {
  production: false,
  useEmulator: true,
  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'localhost',
    projectId: 'demo-iislucas-site',
    storageBucket: 'demo-iislucas-site.appspot.com',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:0000000000000000000000',
  },
  adminEmail: 'admin@example.com',
};
