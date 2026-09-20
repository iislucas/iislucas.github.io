/* theme.service.ts
 *
 * Holds the theme the site is currently shown in, and keeps three things in
 * step with it: the signal components read, the `data-theme` attribute on
 * <html> that the CSS custom properties hang off, and local storage so the
 * choice survives a reload.
 *
 * The choice is per-browser, not per-account: it is a personal view setting,
 * so it is never written to Firestore and never changes what anyone else sees.
 */

import { Injectable, signal } from '@angular/core';
import { DEFAULT_THEME, isTheme, Theme, THEME_OPTIONS } from './theme';

// Namespaced so it cannot collide with anything else on the origin.
const STORAGE_KEY = 'iislucas.site.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  public readonly options = THEME_OPTIONS;

  private readonly current = signal<Theme>(readStoredTheme());
  public readonly theme = this.current.asReadonly();

  // The app root injects this service, so the stored theme is on the document
  // before the first render rather than after it.
  constructor() {
    applyTheme(this.current());
  }

  public select(theme: Theme) {
    this.current.set(theme);
    writeStoredTheme(theme);
    applyTheme(theme);
  }
}

// Reads the saved choice, falling back to the default for a first visit, for a
// theme that no longer exists, or when storage is unavailable (Safari private
// browsing throws rather than returning null).
function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

// A theme that cannot be saved is still applied: the look is right for this
// page load, it just will not be remembered.
function writeStoredTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage is full or blocked; nothing useful to do about it here.
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}
