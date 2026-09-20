/* header.spec.ts
 *
 * The nav bar's controls: the menu that replaced the tabs, the sign-in entry
 * that only appears while signed out, and the share button beside the avatar.
 */

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HeaderComponent } from './header';
import {
  createFirebaseStateServiceMock,
  FirebaseStateService,
  SiteUser,
} from '../firebase-state.service';
import { RoutingService, RoutingConfig } from '../routing.service';
import { ROUTING_CONFIG, initPathPatterns, AppPathPatterns } from '../app.config';
import { ContentService } from '../content.service';
import { Profile, initProfile } from '../data-model/profile';
import { Concept } from '../data-model/concept';

function createContentServiceMock(): ContentService {
  return {
    concepts: signal<Concept[]>([]),
    conceptsLoaded: signal(true),
    profile: signal<Profile>({ ...initProfile(), name: 'Lucas Dixon' }),
  } as Partial<ContentService> as ContentService;
}

function signedInUser(): SiteUser {
  return {
    firebaseUser: {} as never as SiteUser['firebaseUser'],
    email: 'lucas@example.test',
    displayName: 'Lucas Dixon',
    photoURL: null,
    isAdmin: true,
  };
}

// Lets the awaits inside the click handler run without advancing any clock.
async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('HeaderComponent', () => {
  let fixture: ComponentFixture<HeaderComponent>;
  let firebaseState: FirebaseStateService;

  const testConfig: RoutingConfig<AppPathPatterns> = { validPathPatterns: initPathPatterns };

  async function build() {
    window.history.replaceState(null, '', '/');
    TestBed.resetTestingModule();
    firebaseState = createFirebaseStateServiceMock();
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        RoutingService,
        { provide: ROUTING_CONFIG, useValue: testConfig },
        { provide: FirebaseStateService, useValue: firebaseState },
        { provide: ContentService, useValue: createContentServiceMock() },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(HeaderComponent);
    await fixture.whenStable();
  }

  async function openMenu() {
    fixture.nativeElement.querySelector('.menu-anchor .header-icon-btn').click();
    await fixture.whenStable();
  }

  function menuLabels(): string[] {
    return Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('.nav-dropdown .menu-item'),
    ).map((item) => item.textContent?.trim() ?? '');
  }

  function sectionTabs(): HTMLAnchorElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.header-extension-tabs .pill-tab'));
  }

  function shareButton(): HTMLAnchorElement {
    return fixture.nativeElement.querySelector('.nav-actions .header-icon-btn');
  }

  beforeEach(async () => {
    await build();
  });

  afterEach(() => {
    // Restored here rather than at the end of the test that installs them, so
    // a failing assertion cannot leave fake timers on and hang the next test.
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps navigation in the menu rather than as tabs in the bar', async () => {
    expect(fixture.nativeElement.querySelector('.nav-link')).toBeNull();
    expect(fixture.nativeElement.querySelector('.nav-dropdown')).toBeNull();

    await openMenu();

    expect(menuLabels()).toEqual(['About', 'Concept Gallery', 'Sign in']);
  });

  it('offers a way in while signed out, and drops it once signed in', async () => {
    await openMenu();
    expect(menuLabels()).toContain('Sign in');

    firebaseState.user.set(signedInUser());
    await fixture.whenStable();

    expect(menuLabels()).not.toContain('Sign in');
  });

  it('shows the profile menu only when signed in', async () => {
    expect(fixture.nativeElement.querySelector('app-profile-menu')).toBeNull();

    firebaseState.user.set(signedInUser());
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('app-profile-menu')).not.toBeNull();
  });

  it('offers the two sections as tabs under the bar', () => {
    const tabs = sectionTabs();

    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['About Lucas', 'Concept Gallery']);
    // Real links, so they can be opened in a new tab like any other navigation.
    expect(tabs.map((tab) => tab.getAttribute('href'))).toEqual(['/', '/concepts']);
    // At the root, the first tab is the one you are on.
    expect(tabs[0].classList.contains('active')).toBe(true);
    expect(tabs[1].classList.contains('active')).toBe(false);
  });

  it('hides the section tabs on a single concept, which sits below them', async () => {
    window.history.replaceState(null, '', '/concepts/a-concept');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await fixture.whenStable();

    expect(sectionTabs()).toHaveLength(0);
    // The trail and back button are how you get out from there instead.
    expect(fixture.nativeElement.querySelector('.header-icon-btn[href]')).not.toBeNull();
  });

  it('offers sharing to everyone, signed in or not', () => {
    expect(shareButton()).not.toBeNull();
    // Icon only: no text label beside the avatar.
    expect(shareButton().textContent?.trim()).toBe('');
    expect(shareButton().getAttribute('aria-label')).toBe('Share this page');
  });

  it('confirms a share, then goes back to offering one', async () => {
    // Fake timers so the two-second reset does not mean a two-second test.
    // whenStable() never settles under them, so change detection is driven by
    // hand and the pending promises are flushed as microtasks.
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { ...navigator, share: vi.fn().mockResolvedValue(undefined) });

    shareButton().click();
    await flushMicrotasks();
    fixture.detectChanges();
    expect(shareButton().getAttribute('aria-label')).toBe('Link copied');

    vi.advanceTimersByTime(2500);
    fixture.detectChanges();
    expect(shareButton().getAttribute('aria-label')).toBe('Share this page');
  });

  it('leaves a modified click on the share link to the browser', async () => {
    const share = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, share });

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    shareButton().dispatchEvent(event);
    await fixture.whenStable();

    expect(share).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
