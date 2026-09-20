import { readFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ThemeService } from './theme.service';
import { DEFAULT_THEME, isTheme, Theme, THEME_OPTIONS } from './theme';

const STORAGE_KEY = 'iislucas.site.theme';

function createService(): ThemeService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  return TestBed.inject(ThemeService);
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts on the default theme and puts it on the document', () => {
    const service = createService();

    expect(service.theme()).toBe(DEFAULT_THEME);
    expect(document.documentElement.getAttribute('data-theme')).toBe(DEFAULT_THEME);
  });

  it('applies and remembers a chosen theme', () => {
    const service = createService();
    // Deliberately not the default, so this cannot pass by doing nothing.
    expect(DEFAULT_THEME).not.toBe(Theme.Slate);

    service.select(Theme.Slate);

    expect(service.theme()).toBe(Theme.Slate);
    expect(document.documentElement.getAttribute('data-theme')).toBe(Theme.Slate);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(Theme.Slate);
  });

  it('restores the remembered theme on a later visit', () => {
    localStorage.setItem(STORAGE_KEY, Theme.Harbor);

    const service = createService();

    expect(service.theme()).toBe(Theme.Harbor);
    expect(document.documentElement.getAttribute('data-theme')).toBe(Theme.Harbor);
  });

  it('falls back to the default when the stored theme is no longer known', () => {
    localStorage.setItem(STORAGE_KEY, 'a-theme-that-was-removed');

    expect(createService().theme()).toBe(DEFAULT_THEME);
  });

  it('still applies a theme when local storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    const service = createService();
    expect(service.theme()).toBe(DEFAULT_THEME);

    service.select(Theme.Ink);
    expect(service.theme()).toBe(Theme.Ink);
    expect(document.documentElement.getAttribute('data-theme')).toBe(Theme.Ink);
  });

  it('offers every theme exactly once in the picker', () => {
    const ids = THEME_OPTIONS.map((option) => option.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(Object.values(Theme)));
  });
});

/*
 * The default theme, and the set of themes, are stated twice: once here in
 * TypeScript and once in the stylesheet that emits their custom properties.
 * They have to agree, and nothing at compile time makes them — a mismatch just
 * shows the wrong colours. These read the stylesheet and check.
 */
describe('theme definitions and the stylesheet', () => {
  const stylesheet = readFileSync('src/scss_themes.scss', 'utf8');

  it('agrees on which theme is the default', () => {
    const declared = stylesheet.match(/\$default-theme:\s*'([^']+)'/)?.[1];

    expect(declared).toBe(DEFAULT_THEME);
  });

  it('defines every theme the enum names', () => {
    const defined = Array.from(stylesheet.matchAll(/^ {2}'([a-z-]+)': \(/gm)).map((m) => m[1]);

    expect(new Set(defined)).toEqual(new Set(Object.values(Theme)));
  });
});

describe('isTheme', () => {
  it('accepts known theme ids and rejects anything else', () => {
    expect(isTheme(Theme.Slate)).toBe(true);
    expect(isTheme('slate')).toBe(true);
    expect(isTheme('sepia')).toBe(false);
    expect(isTheme('')).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});
