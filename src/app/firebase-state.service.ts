/* firebase-state.service.ts
 *
 * Authentication and authorization state for the site.
 *
 * Forked from ilc-members-manager's service of the same name and cut down to
 * what a personal site needs. The membership model is gone; what remains is:
 *
 *   - sign in with Google or email/password, sign out, reset password — but
 *     never sign up: accounts are not created from this site,
 *   - a single `isAdmin` bit, read from the same `acl/{email}` document shape
 *     that firestore.rules checks. The client read is for the UI only —
 *     hiding an edit button is a convenience, the rules are the enforcement.
 *     A signed-in account without it is signed back out: sign-in is only for
 *     the site's editor.
 *
 * Auth state is exposed as signals so zoneless components can bind to it
 * directly.
 */

import { inject, Injectable, signal, computed } from '@angular/core';
import {
  Auth,
  AuthErrorCodes,
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
  UserCredential,
} from 'firebase/auth';
import { doc, Firestore, getDoc, getFirestore } from 'firebase/firestore';
import { FIREBASE_APP } from './app.config';
import { NO_NEW_ACCOUNTS_MESSAGE } from './auth-error-messages';

type AuthErrorCodeStr = (typeof AuthErrorCodes)[keyof typeof AuthErrorCodes];

export type FirebaseAuthError = Error & { code: AuthErrorCodeStr };

export type AuthOperationResult =
  | { success: true; userCredential: UserCredential }
  | { success: false; errorCode: AuthErrorCodeStr };

export type LogoutResult = { success: true } | { success: false; errorCode: AuthErrorCodeStr };

export type ResetPasswordResult =
  { success: true } | { success: false; errorCode: AuthErrorCodeStr };

export enum LoginStatus {
  // Firebase has not yet told us whether there is a signed-in user. Distinct
  // from SignedOut: the UI shows a spinner here, not a login form, so a
  // returning admin never sees the page flash to its logged-out state.
  Loading = 'Loading',
  LoggingIn = 'LoggingIn',
  SignedIn = 'SignedIn',
  SignedOut = 'SignedOut',
}

export interface SiteUser {
  firebaseUser: User;
  email: string;
  displayName: string;
  photoURL: string | null;
  // True when `acl/{email}` exists with isAdmin: true.
  isAdmin: boolean;
}

@Injectable({ providedIn: 'root' })
export class FirebaseStateService {
  public app = inject(FIREBASE_APP);
  private auth: Auth;
  private db: Firestore;

  public loginStatus = signal<LoginStatus>(LoginStatus.Loading);
  public user = signal<SiteUser | null>(null);
  public loginError = signal<string | null>(null);

  /** True only for a signed-in user with an admin ACL document. */
  public isAdmin = computed(() => this.user()?.isAdmin === true);

  constructor() {
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);

    // Without explicit local persistence the session is dropped on reload.
    setPersistence(this.auth, browserLocalPersistence).catch((e) =>
      console.error('FirebaseStateService: failed to set persistence', e),
    );

    onAuthStateChanged(this.auth, async (firebaseUser) => {
      if (!firebaseUser || !firebaseUser.email) {
        this.user.set(null);
        this.loginStatus.set(LoginStatus.SignedOut);
        return;
      }
      const isAdmin = await this.fetchIsAdmin(firebaseUser.email);
      // Only the editor has any use for a session here. Anyone else — say a
      // Google account signing in before new accounts were switched off — is
      // signed straight back out, and the login page says why.
      if (!isAdmin) {
        this.loginError.set(NO_NEW_ACCOUNTS_MESSAGE);
        this.user.set(null);
        this.loginStatus.set(LoginStatus.SignedOut);
        await signOut(this.auth).catch((e) =>
          console.error('FirebaseStateService: sign-out of a non-admin failed', e),
        );
        return;
      }
      this.loginError.set(null);
      this.user.set({
        firebaseUser,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName ?? firebaseUser.email,
        photoURL: firebaseUser.photoURL,
        isAdmin,
      });
      this.loginStatus.set(LoginStatus.SignedIn);
    });
  }

  /**
   * Reads `acl/{email}`. A missing document, or a rules refusal, both mean
   * "not an admin" — the caller gets false rather than an exception, because a
   * signed-in non-admin is an ordinary visitor here, not an error.
   */
  private async fetchIsAdmin(email: string): Promise<boolean> {
    try {
      const snapshot = await getDoc(doc(this.db, 'acl', email));
      return snapshot.exists() && snapshot.data()['isAdmin'] === true;
    } catch (e) {
      console.warn('FirebaseStateService: could not read ACL document', e);
      return false;
    }
  }

  public async loginWithGoogle(): Promise<AuthOperationResult> {
    this.loginStatus.set(LoginStatus.LoggingIn);
    try {
      const userCredential = await signInWithPopup(this.auth, new GoogleAuthProvider());
      return { success: true, userCredential };
    } catch (exception: unknown) {
      const error = exception as FirebaseAuthError;
      // A cancelled popup is the user changing their mind, not a failure to report.
      if (error.code !== 'auth/cancelled-popup-request') {
        console.error('Google login failed:', error);
      }
      this.loginStatus.set(LoginStatus.SignedOut);
      return { success: false, errorCode: error.code };
    }
  }

  public async loginWithEmail(email: string, password: string): Promise<AuthOperationResult> {
    this.loginStatus.set(LoginStatus.LoggingIn);
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      return { success: true, userCredential };
    } catch (exception: unknown) {
      const error = exception as FirebaseAuthError;
      console.error('Email login failed:', error);
      this.loginStatus.set(LoginStatus.SignedOut);
      return { success: false, errorCode: error.code };
    }
  }

  public async logout(): Promise<LogoutResult> {
    try {
      this.user.set(null);
      this.loginStatus.set(LoginStatus.SignedOut);
      await signOut(this.auth);
      return { success: true };
    } catch (exception: unknown) {
      const error = exception as FirebaseAuthError;
      console.error('Logout failed:', error);
      return { success: false, errorCode: error.code };
    }
  }

  public async resetPassword(email: string): Promise<ResetPasswordResult> {
    try {
      await sendPasswordResetEmail(this.auth, email);
      return { success: true };
    } catch (exception: unknown) {
      const error = exception as FirebaseAuthError;
      console.error('Password reset failed:', error);
      return { success: false, errorCode: error.code };
    }
  }
}

/** Minimal stand-in for tests that render components depending on auth state. */
export function createFirebaseStateServiceMock(
  overrides: Partial<FirebaseStateService> = {},
): FirebaseStateService {
  const user = signal<SiteUser | null>(null);
  return {
    user,
    isAdmin: computed(() => user()?.isAdmin === true),
    loginStatus: signal(LoginStatus.SignedOut),
    loginError: signal(null),
    loginWithGoogle: () => Promise.resolve({ success: false, errorCode: 'auth/internal-error' }),
    loginWithEmail: () => Promise.resolve({ success: false, errorCode: 'auth/internal-error' }),
    logout: () => Promise.resolve({ success: true }),
    resetPassword: () => Promise.resolve({ success: true }),
    ...overrides,
  } as Partial<FirebaseStateService> as FirebaseStateService;
}
