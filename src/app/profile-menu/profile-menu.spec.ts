import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileMenuComponent } from './profile-menu';
import {
  createFirebaseStateServiceMock,
  FirebaseStateService,
  SiteUser,
} from '../firebase-state.service';
import { RoutingService } from '../routing.service';
import { ROUTING_CONFIG, initPathPatterns } from '../app.config';
import { ThemeService } from '../theme/theme.service';
import { DEFAULT_THEME, Theme, THEME_OPTIONS } from '../theme/theme';

function signedInUser(): SiteUser {
  return {
    firebaseUser: {} as never as SiteUser['firebaseUser'],
    email: 'lucas@example.com',
    displayName: 'Lucas Dixon',
    photoURL: null,
    isAdmin: true,
  };
}

// The picker lives inside the dropdown, which only exists once the avatar is
// clicked, so every test opens the menu first.
async function openMenu(fixture: ComponentFixture<ProfileMenuComponent>) {
  const avatar: HTMLButtonElement = fixture.nativeElement.querySelector('.avatar-button');
  avatar.click();
  await fixture.whenStable();
}

function themeButtons(fixture: ComponentFixture<ProfileMenuComponent>): HTMLButtonElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('.theme-option'));
}

describe('ProfileMenuComponent appearance picker', () => {
  let fixture: ComponentFixture<ProfileMenuComponent>;
  let themes: ThemeService;

  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');

    const firebaseState = createFirebaseStateServiceMock();
    firebaseState.user.set(signedInUser());

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: FirebaseStateService, useValue: firebaseState },
        // The menu's edit-mode entry reaches EditModeService, which mirrors
        // edit mode into the URL and so needs a router.
        RoutingService,
        { provide: ROUTING_CONFIG, useValue: { validPathPatterns: initPathPatterns } },
      ],
    });

    themes = TestBed.inject(ThemeService);
    fixture = TestBed.createComponent(ProfileMenuComponent);
    await fixture.whenStable();
  });

  it('lists every theme, each with its own swatch', async () => {
    await openMenu(fixture);

    const buttons = themeButtons(fixture);
    expect(buttons.length).toBe(THEME_OPTIONS.length);

    const swatchIds = buttons.map((button) =>
      button.querySelector('.theme-swatch')?.getAttribute('data-theme-preview'),
    );
    expect(swatchIds).toEqual(THEME_OPTIONS.map((option) => option.id));

    const labels = buttons.map((button) => button.querySelector('.theme-label')?.textContent);
    expect(labels).toEqual(THEME_OPTIONS.map((option) => option.label));
  });

  it('marks exactly the active theme', async () => {
    await openMenu(fixture);

    const active = themeButtons(fixture).filter((button) => button.classList.contains('active'));
    expect(active.length).toBe(1);
    expect(active[0].querySelector('.theme-swatch')?.getAttribute('data-theme-preview')).toBe(
      DEFAULT_THEME,
    );
  });

  it('switches theme when an entry is clicked, and keeps the menu open', async () => {
    await openMenu(fixture);

    // Deliberately not the default, so this cannot pass by doing nothing.
    expect(DEFAULT_THEME).not.toBe(Theme.Slate);
    const index = THEME_OPTIONS.findIndex((option) => option.id === Theme.Slate);
    themeButtons(fixture)[index].click();
    await fixture.whenStable();

    expect(themes.theme()).toBe(Theme.Slate);
    expect(document.documentElement.getAttribute('data-theme')).toBe(Theme.Slate);

    // Still open, so another look can be tried straight away.
    const buttons = themeButtons(fixture);
    expect(buttons.length).toBe(THEME_OPTIONS.length);
    expect(buttons[index].classList.contains('active')).toBe(true);
  });
});
