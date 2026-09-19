/* routing.service.spec.ts
 *
 * Exercises the router against THIS site's route table (app.config.ts), rather
 * than the generic machinery, which routing.utils.spec.ts already covers.
 *
 * The cases worth pinning down here are the ones the site's URLs actually
 * depend on: concept slugs round-tripping through the path, the gallery's
 * filters living in the query string, and `/concepts/new` colliding with
 * `/concepts/:slug` — a collision App resolves deliberately.
 */

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Component, inject, provideZonelessChangeDetection } from '@angular/core';
import { RoutingService, RoutingConfig } from './routing.service';
import {
  Views,
  ROUTING_CONFIG,
  initPathPatterns,
  AppPathPatterns,
  RESERVED_SLUGS,
} from './app.config';

@Component({ template: '', standalone: true })
class TestRouterComponent {
  routingService = inject(RoutingService);
}

/** The current location as the app sees it: path plus query, no origin. */
function currentUrl(): string {
  return window.location.pathname + window.location.search;
}

/** Simulates an external URL change — a typed URL, or back/forward. */
function setUrl(url: string): void {
  window.history.replaceState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

describe('RoutingService (site routes)', () => {
  let service: RoutingService<AppPathPatterns>;
  let fixture: ComponentFixture<TestRouterComponent>;

  const testConfig: RoutingConfig<AppPathPatterns> = { validPathPatterns: initPathPatterns };

  async function configureTestBed() {
    await TestBed.configureTestingModule({
      imports: [TestRouterComponent],
      providers: [
        provideZonelessChangeDetection(),
        RoutingService,
        { provide: ROUTING_CONFIG, useValue: testConfig },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestRouterComponent);
    service = fixture.componentInstance.routingService;
    await fixture.whenStable();
  }

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    TestBed.resetTestingModule();
  });

  it('matches the root path to Home', async () => {
    await configureTestBed();
    setUrl('/');
    await fixture.whenStable();
    expect(service.matchedPatternId()).toBe(Views.Home);
  });

  it('matches the gallery', async () => {
    await configureTestBed();
    setUrl('/concepts');
    await fixture.whenStable();
    expect(service.matchedPatternId()).toBe(Views.Concepts);
  });

  it('reads a concept slug out of the path', async () => {
    await configureTestBed();
    setUrl('/concepts/emotional-fixed-points');
    await fixture.whenStable();
    expect(service.matchedPatternId()).toBe(Views.ConceptView);
    expect(service.signals[Views.ConceptView].pathVars['slug']()).toBe('emotional-fixed-points');
  });

  it('matches the edit route under a concept', async () => {
    await configureTestBed();
    setUrl('/concepts/inner-gold/edit');
    await fixture.whenStable();
    expect(service.matchedPatternId()).toBe(Views.ConceptEdit);
    expect(service.signals[Views.ConceptEdit].pathVars['slug']()).toBe('inner-gold');
  });

  /*
   * `/concepts/new` fits `/concepts/:slug` as well as its own literal pattern,
   * and the matcher takes the first that fits — so this passes only while
   * ConceptNew is declared before ConceptView in the route table. Reordering
   * them would silently turn the "new concept" page into a concept named
   * "new", which is exactly the regression this pins down.
   */
  it('matches /concepts/new as ConceptNew, not as a slug', async () => {
    await configureTestBed();
    setUrl('/concepts/new');
    await fixture.whenStable();
    expect(service.matchedPatternId()).toBe(Views.ConceptNew);
  });

  it('reserves every slug that a route would shadow', () => {
    // Anything in RESERVED_SLUGS must actually be shadowed by a route, and
    // anything shadowed by a route must be reserved — otherwise the editor
    // either refuses a usable name or accepts an unreachable one.
    expect(RESERVED_SLUGS.has('new')).toBe(true);
  });

  it('keeps the gallery filters in the query string', async () => {
    await configureTestBed();
    service.matchedPatternId.set(Views.Concepts);
    service.signals[Views.Concepts].urlParams['q'].set('fixed');
    service.signals[Views.Concepts].urlParams['tag'].set('mathematics');
    await fixture.whenStable();
    const url = currentUrl();
    expect(url).toContain('q=fixed');
    expect(url).toContain('tag=mathematics');
  });

  it('reads gallery filters back out of the URL', async () => {
    await configureTestBed();
    setUrl('/concepts?q=envy&tag=emotions');
    await fixture.whenStable();
    expect(service.matchedPatternId()).toBe(Views.Concepts);
    expect(service.signals[Views.Concepts].urlParams['q']()).toBe('envy');
    expect(service.signals[Views.Concepts].urlParams['tag']()).toBe('emotions');
  });

  it('omits empty filters from the URL', async () => {
    await configureTestBed();
    service.matchedPatternId.set(Views.Concepts);
    await fixture.whenStable();
    expect(currentUrl()).toBe('/concepts');
  });

  it('builds hrefs for a concept from its slug', async () => {
    await configureTestBed();
    expect(service.hrefForView(Views.ConceptView, { slug: 'inner-gold' })).toBe(
      '/concepts/inner-gold',
    );
    expect(service.hrefForView(Views.ConceptEdit, { slug: 'inner-gold' })).toBe(
      '/concepts/inner-gold/edit',
    );
  });

  it('percent-encodes and decodes awkward slugs', async () => {
    await configureTestBed();
    service.matchedPatternId.set(Views.ConceptView);
    service.signals[Views.ConceptView].pathVars['slug'].set('a b');
    await fixture.whenStable();
    expect(currentUrl()).toBe('/concepts/a%20b');

    setUrl('/concepts/a%20b');
    await fixture.whenStable();
    expect(service.signals[Views.ConceptView].pathVars['slug']()).toBe('a b');
  });

  it('navigates to the gallery via navigateTo', async () => {
    await configureTestBed();
    service.navigateTo('concepts?q=joy');
    await fixture.whenStable();
    expect(currentUrl()).toBe('/concepts?q=joy');
    expect(service.matchedPatternId()).toBe(Views.Concepts);
    expect(service.signals[Views.Concepts].urlParams['q']()).toBe('joy');
  });

  it('reports no match for an unknown path', async () => {
    await configureTestBed();
    setUrl('/this/path/does/not/exist');
    await fixture.whenStable();
    expect(service.matchedPatternId()).toBeNull();
  });

  it('treats returnUrl on the login route as ephemeral', async () => {
    await configureTestBed();
    setUrl('/login?returnUrl=concepts%2Finner-gold');
    await fixture.whenStable();
    expect(service.matchedPatternId()).toBe(Views.Login);
    expect(service.signals[Views.Login].urlParams['returnUrl']()).toBe('concepts/inner-gold');
  });
});
