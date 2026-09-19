/* auth-error-messages.spec.ts
 *
 * Covers the Google sign-in branch of the error-code mapping. The cases that
 * matter are the ones a user cannot act on themselves: they have to name the
 * real cause rather than invite a pointless retry, and they have to keep the
 * raw code, because the code is what makes the failure diagnosable when it is
 * reported to us.
 */

import { googleSignInErrorMessage } from './auth-error-messages';

describe('googleSignInErrorMessage', () => {
  it('names the configuration fault behind an unauthorized domain', () => {
    const message = googleSignInErrorMessage('auth/unauthorized-domain');
    expect(message).toContain('auth/unauthorized-domain');
    expect(message).toContain('password');
  });

  it('does not ask the user to retry a failure retrying cannot fix', () => {
    expect(googleSignInErrorMessage('auth/unauthorized-domain')).not.toContain('try again');
  });

  it('explains a blocked popup in terms of what the user can change', () => {
    expect(googleSignInErrorMessage('auth/popup-blocked')).toContain('pop-ups');
  });

  it('keeps the code in the fallback for an unrecognised failure', () => {
    expect(googleSignInErrorMessage('auth/something-new')).toContain('auth/something-new');
  });

  it('still produces a message when there is no code at all', () => {
    expect(googleSignInErrorMessage(undefined)).toContain('unknown error');
  });
});
