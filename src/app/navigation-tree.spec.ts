/* navigation-tree.spec.ts
 *
 * Pins down the shape of the tree: what the trail says on each page, where the
 * back button goes, and that a concept's name arrives with the content rather
 * than showing its slug in the meantime.
 */

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Component, inject, provideZonelessChangeDetection, signal } from '@angular/core';
import { describe, it, expect, beforeEach } from 'vitest';
import { NavigationTreeService } from './navigation-tree';
import { RoutingService, RoutingConfig } from './routing.service';
import { ROUTING_CONFIG, initPathPatterns, AppPathPatterns, Views } from './app.config';
import { ContentService } from './content.service';
import { Concept, initConcept } from './data-model/concept';
import { Profile, initProfile } from './data-model/profile';

@Component({ template: '', standalone: true })
class TestHost {
  routingService = inject(RoutingService);
  navTree = inject(NavigationTreeService);
}

function makeConcept(slug: string, title: string): Concept {
  return { ...initConcept(slug), title, published: true };
}

function makeProfile(name: string): Profile {
  return { ...initProfile(), name };
}

// Only the three members the navigation tree reads; the rest of ContentService
// is Firestore wiring that has no bearing on the trail.
function createContentServiceMock(): ContentService {
  return {
    concepts: signal<Concept[]>([]),
    conceptsLoaded: signal(false),
    profile: signal<Profile>(makeProfile('Lucas Dixon')),
  } as Partial<ContentService> as ContentService;
}

function setUrl(url: string): void {
  window.history.replaceState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

describe('NavigationTreeService', () => {
  let fixture: ComponentFixture<TestHost>;
  let navTree: NavigationTreeService;
  let content: ContentService;

  const testConfig: RoutingConfig<AppPathPatterns> = { validPathPatterns: initPathPatterns };

  async function goTo(url: string) {
    setUrl(url);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    window.history.replaceState(null, '', '/');
    TestBed.resetTestingModule();

    content = createContentServiceMock();
    await TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [
        provideZonelessChangeDetection(),
        RoutingService,
        { provide: ROUTING_CONFIG, useValue: testConfig },
        { provide: ContentService, useValue: content },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHost);
    navTree = fixture.componentInstance.navTree;
    await fixture.whenStable();
  });

  it('shows only the site name at the root, with nothing above it', async () => {
    await goTo('/');

    expect(navTree.currentView()).toBe(Views.Home);
    expect(navTree.breadcrumbs().map((crumb) => crumb.label)).toEqual(['Lucas Dixon']);
    expect(navTree.upNode()).toBeNull();
  });

  it('puts the gallery under the site root', async () => {
    await goTo('/concepts');

    expect(navTree.breadcrumbs().map((crumb) => crumb.label)).toEqual([
      'Lucas Dixon',
      'Concept Gallery',
    ]);
    // Only the last crumb is the page you are on, so only it has no link.
    expect(navTree.breadcrumbs().at(-1)?.url).toBeUndefined();
    expect(navTree.upNode()?.label).toBe('Lucas Dixon');
  });

  it('puts a concept under the gallery, and points the back button at it', async () => {
    content.concepts.set([makeConcept('fixed-points', 'Emotional Fixed Points')]);
    content.conceptsLoaded.set(true);
    await goTo('/concepts/fixed-points');

    expect(navTree.breadcrumbs().map((crumb) => crumb.label)).toEqual([
      'Lucas Dixon',
      'Concept Gallery',
      'Emotional Fixed Points',
    ]);
    expect(navTree.upNode()?.label).toBe('Concept Gallery');
    expect(navTree.upNode()?.url).toBe('/concepts');
  });

  it('marks the concept title as loading until the content arrives', async () => {
    await goTo('/concepts/fixed-points');

    expect(navTree.currentTitleIsLoading()).toBe(true);

    content.concepts.set([makeConcept('fixed-points', 'Emotional Fixed Points')]);
    content.conceptsLoaded.set(true);

    expect(navTree.currentTitleIsLoading()).toBe(false);
    expect(navTree.currentTitle()).toBe('Emotional Fixed Points');
  });

  it('falls back to the slug for a concept that is not there', async () => {
    content.conceptsLoaded.set(true);
    await goTo('/concepts/no-such-thing');

    expect(navTree.currentTitle()).toBe('no-such-thing');
  });

  it('names the sign-in page and an unmatched URL', async () => {
    await goTo('/login');
    expect(navTree.currentTitle()).toBe('Sign in');
    expect(navTree.upNode()?.label).toBe('Lucas Dixon');

    await goTo('/nowhere/at/all');
    expect(navTree.currentView()).toBeNull();
    expect(navTree.currentTitle()).toBe('Page not found');
  });

  it('follows the editable profile name', async () => {
    await goTo('/concepts');
    content.profile.set(makeProfile('L. Dixon'));

    expect(navTree.breadcrumbs()[0].label).toBe('L. Dixon');
    expect(navTree.documentTitle()).toBe('Concept Gallery — L. Dixon');
  });

  it('does not repeat the site name in the document title at the root', async () => {
    await goTo('/');

    expect(navTree.documentTitle()).toBe('Lucas Dixon');
  });
});
