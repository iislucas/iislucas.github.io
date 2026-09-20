/* share-page.ts
 *
 * Shares a link to the page you are on, the way ilc-members-manager does it:
 * hand it to the platform's own share sheet where there is one (which is what
 * a phone user expects), and fall back to putting it on the clipboard.
 *
 * It lives apart from the component that renders the button so that the four
 * ways this can end — shared, copied, cancelled, failed — can be tested
 * without a DOM, and so the caller can tell "the person cancelled" apart from
 * "nothing worked". Those two must not look the same: confirming a share that
 * never happened is worse than saying nothing.
 */

export enum ShareOutcome {
  // Handed to the platform share sheet, which reported success.
  Shared = 'shared',
  // No share sheet, or it failed; the URL is on the clipboard instead.
  Copied = 'copied',
  // The share sheet was dismissed. Not a failure, and not worth falling back.
  Cancelled = 'cancelled',
  // Neither sharing nor copying worked.
  Failed = 'failed',
}

/** Whether this outcome is worth confirming to the person who clicked. */
export function isShared(outcome: ShareOutcome): boolean {
  return outcome === ShareOutcome.Shared || outcome === ShareOutcome.Copied;
}

export async function sharePage(url: string, title: string): Promise<ShareOutcome> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return ShareOutcome.Shared;
    } catch (error) {
      // Dismissing the sheet is a decision, not a failure: quietly copying
      // instead would be doing something that was just declined.
      if (error instanceof Error && error.name === 'AbortError') {
        return ShareOutcome.Cancelled;
      }
    }
  }

  return (await copyToClipboard(url)) ? ShareOutcome.Copied : ShareOutcome.Failed;
}

// The async clipboard API needs a secure context and permission; the textarea
// fallback is what works in the browsers and contexts where it does not.
async function copyToClipboard(url: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Fall through to the textarea below.
    }
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textArea);
    return copied;
  } catch {
    return false;
  }
}
