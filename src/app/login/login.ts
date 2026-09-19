/* login.ts
 *
 * The sign-in page. A cut-down fork of ilc-members-manager's <app-inline-auth>:
 * the guided membership flow (checking whether an email has a member record,
 * offering to buy a membership, email verification prompts) is gone, because
 * this site has exactly one kind of account. What is kept is the part worth
 * keeping — Google sign-in, email and password, and a password reset that is
 * offered precisely when the error code says a reset would help.
 *
 * Signing in is only for the site's editor. Nothing links here — the page is
 * reached by typing /login — no account can be created from it, and an
 * account without an `acl/{email}` admin document is signed straight back out
 * by FirebaseStateService (firestore.rules enforce the same thing on writes).
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FirebaseStateService, LoginStatus } from '../firebase-state.service';
import { RoutingService } from '../routing.service';
import { AppPathPatterns, Views } from '../app.config';
import { IconComponent } from '../icons/icon.component';
import {
  googleSignInErrorMessage,
  isPasswordResettable,
  passwordResetErrorMessage,
  signInErrorMessage,
} from '../auth-error-messages';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private firebaseState = inject(FirebaseStateService);
  private routingService: RoutingService<AppPathPatterns> = inject(RoutingService);

  protected email = signal('');
  protected password = signal('');
  protected errorMessage = signal<string | null>(null);
  protected errorCode = signal<string | undefined>(undefined);
  protected resetSentTo = signal<string | null>(null);
  protected busy = signal(false);
  // Set once a sign-in succeeds, so that the page leaves only after the admin
  // check has settled — not on an account that is about to be signed out.
  private signedInHere = signal(false);

  protected isSignedIn = computed(() => this.firebaseState.loginStatus() === LoginStatus.SignedIn);
  protected user = this.firebaseState.user;

  // A sign-in refused after the fact (an account with no admin access) is
  // reported by the service rather than by the sign-in call.
  protected shownError = computed(() => this.errorMessage() ?? this.firebaseState.loginError());

  constructor() {
    effect(() => {
      if (this.signedInHere() && this.firebaseState.isAdmin()) {
        untracked(() => this.returnToCaller());
      }
    });
  }

  /** Shown only when the failure is one a reset link can actually fix. */
  protected canReset = computed(() => isPasswordResettable(this.errorCode()));

  protected async signInWithGoogle() {
    this.startAttempt();
    const result = await this.firebaseState.loginWithGoogle();
    this.busy.set(false);
    if (!result.success) {
      // A cancelled popup is the user closing the window; not worth an error.
      if (result.errorCode === 'auth/cancelled-popup-request') return;
      this.errorCode.set(result.errorCode);
      this.errorMessage.set(googleSignInErrorMessage(result.errorCode));
      return;
    }
    this.signedInHere.set(true);
  }

  protected async signInWithEmail() {
    const email = this.email().trim();
    if (!email || !this.password()) {
      this.errorMessage.set('Enter both an email address and a password.');
      return;
    }
    this.startAttempt();
    const result = await this.firebaseState.loginWithEmail(email, this.password());
    this.busy.set(false);
    if (!result.success) {
      this.errorCode.set(result.errorCode);
      this.errorMessage.set(signInErrorMessage(result.errorCode));
      return;
    }
    this.signedInHere.set(true);
  }

  protected async sendPasswordReset() {
    const email = this.email().trim();
    if (!email) {
      this.errorMessage.set('Enter your email address first, then ask for a reset link.');
      return;
    }
    this.busy.set(true);
    const result = await this.firebaseState.resetPassword(email);
    this.busy.set(false);
    if (!result.success) {
      this.errorCode.set(result.errorCode);
      this.errorMessage.set(passwordResetErrorMessage(result.errorCode));
      return;
    }
    this.errorMessage.set(null);
    this.resetSentTo.set(email);
  }

  private startAttempt() {
    this.busy.set(true);
    this.firebaseState.loginError.set(null);
    this.errorMessage.set(null);
    this.errorCode.set(undefined);
    this.resetSentTo.set(null);
  }

  /**
   * Returns to wherever sign-in was started from. `returnUrl` is an ephemeral
   * URL param set by the header's sign-in link; it is stripped of any leading
   * slash and never allowed to be an absolute URL, so it cannot be used to
   * bounce a visitor to another site.
   */
  private returnToCaller() {
    const returnUrl = this.routingService.signals[Views.Login].urlParams.returnUrl();
    const safe =
      returnUrl && !returnUrl.startsWith('http') && !returnUrl.startsWith('//')
        ? returnUrl.replace(/^\/+/, '')
        : '';
    this.routingService.navigateTo(safe);
  }
}
