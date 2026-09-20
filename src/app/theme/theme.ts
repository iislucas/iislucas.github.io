/* theme.ts
 *
 * The set of visual themes the site can be shown in, and what each one is
 * called in the appearance picker.
 *
 * A theme is nothing but a bundle of CSS custom properties: the values live in
 * `src/scss_themes.scss`, keyed by the same ids as the `Theme` enum below, and
 * are selected by a `data-theme` attribute on <html> (see theme.service.ts).
 * Adding a theme therefore means adding an entry here AND an entry with the
 * same key to the `$themes` map in that stylesheet.
 */

export enum Theme {
  Slate = 'slate',
  Pewter = 'pewter',
  Dusk = 'dusk',
  Tide = 'tide',
  Harbor = 'harbor',
  Ink = 'ink',
  Mist = 'mist',
}

export interface ThemeOption {
  id: Theme;
  // Shown as the entry's name in the appearance picker.
  label: string;
  // One short line under the name, saying what the look is going for.
  description: string;
}

// The theme a visitor gets when they have never chosen one. Must match
// `$default-theme` in src/scss_themes.scss, which emits these values on :root.
export const DEFAULT_THEME = Theme.Tide;

// Listed in the order they appear in the picker.
export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: Theme.Tide,
    label: 'Tide',
    description: 'Green-cast slate, teal accent',
  },
  {
    id: Theme.Mist,
    label: 'Mist',
    description: 'Lightest and airiest, soft edges',
  },
  {
    id: Theme.Slate,
    label: 'Slate',
    description: 'Lighter slate bar, dark slate rule',
  },
  {
    id: Theme.Pewter,
    label: 'Pewter',
    description: 'Warmer grey bar, steel blue accent',
  },
  {
    id: Theme.Dusk,
    label: 'Dusk',
    description: 'Slate towards violet, indigo accent',
  },
  {
    id: Theme.Harbor,
    label: 'Harbor',
    description: 'Navy bar, brighter azure accent',
  },
  {
    id: Theme.Ink,
    label: 'Ink',
    description: 'Darker, crisper, square corners',
  },
];

// Narrows an arbitrary stored string — anything can end up in local storage —
// to a theme this build still knows about.
export function isTheme(value: string | null): value is Theme {
  return value !== null && Object.values<string>(Theme).includes(value);
}
