/* environment.types.ts
 *
 * The TypeScript contract shared by every environment file
 * (`environment.ts`, `environment.local.ts`, `environment.emulator.ts`).
 */

// Firebase project initialization credentials. These are public values: they
// ship inside the browser bundle of every Firebase web app. Access control is
// enforced by Firestore rules (see firestore.rules), not by hiding these.
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export interface AppEnvironment {
  // True in production builds.
  production: boolean;
  // True when talking to the local Firebase Emulator Suite.
  useEmulator: boolean;
  // Firebase web credentials.
  firebase: FirebaseConfig;
  // Contact address shown on the login page when sign-in is refused.
  adminEmail: string;
}
