/* share-page.spec.ts
 *
 * The four ways sharing can end. The one that matters most is Cancelled:
 * dismissing the share sheet must not fall through to copying, and must not be
 * confirmed as though something happened.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { isShared, sharePage, ShareOutcome } from './share-page';

const URL_UNDER_TEST = 'https://example.test/concepts/a-concept';
const TITLE = 'A Concept — Lucas Dixon';

function abortError(): Error {
  const error = new Error('dismissed');
  error.name = 'AbortError';
  return error;
}

describe('sharePage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the platform share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share });

    expect(await sharePage(URL_UNDER_TEST, TITLE)).toBe(ShareOutcome.Shared);
    expect(share).toHaveBeenCalledWith({ title: TITLE, url: URL_UNDER_TEST });
  });

  it('copies to the clipboard when there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });

    expect(await sharePage(URL_UNDER_TEST, TITLE)).toBe(ShareOutcome.Copied);
    expect(writeText).toHaveBeenCalledWith(URL_UNDER_TEST);
  });

  it('reports a dismissed share sheet without copying instead', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      share: vi.fn().mockRejectedValue(abortError()),
      clipboard: { writeText },
    });

    expect(await sharePage(URL_UNDER_TEST, TITLE)).toBe(ShareOutcome.Cancelled);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when the share sheet fails outright', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      share: vi.fn().mockRejectedValue(new Error('not allowed')),
      clipboard: { writeText },
    });

    expect(await sharePage(URL_UNDER_TEST, TITLE)).toBe(ShareOutcome.Copied);
    expect(writeText).toHaveBeenCalledWith(URL_UNDER_TEST);
  });

  it('falls back to a textarea when the clipboard API refuses', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      share: undefined,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    expect(await sharePage(URL_UNDER_TEST, TITLE)).toBe(ShareOutcome.Copied);
    expect(execCommand).toHaveBeenCalledWith('copy');
    // The scratch textarea must not be left behind in the document.
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('reports failure when nothing works', async () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: undefined });
    document.execCommand = vi.fn().mockReturnValue(false);

    expect(await sharePage(URL_UNDER_TEST, TITLE)).toBe(ShareOutcome.Failed);
  });
});

describe('isShared', () => {
  it('is true only for outcomes worth confirming', () => {
    expect(isShared(ShareOutcome.Shared)).toBe(true);
    expect(isShared(ShareOutcome.Copied)).toBe(true);
    expect(isShared(ShareOutcome.Cancelled)).toBe(false);
    expect(isShared(ShareOutcome.Failed)).toBe(false);
  });
});
