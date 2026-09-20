/* footer.spec.ts
 *
 * What is left in the footer now that sharing has moved to the nav bar and the
 * build stamp to the app shell: the owner's name and the links.
 */

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { describe, it, expect, beforeEach } from 'vitest';
import { FooterComponent } from './footer';
import { ContentService } from '../content.service';
import { Profile, initProfile } from '../data-model/profile';
import { Concept } from '../data-model/concept';

// Only what the footer reads; the rest of ContentService is Firestore wiring.
function createContentServiceMock(): ContentService {
  return {
    concepts: signal<Concept[]>([]),
    conceptsLoaded: signal(true),
    profile: signal<Profile>({ ...initProfile(), name: 'Lucas Dixon' }),
  } as Partial<ContentService> as ContentService;
}

describe('FooterComponent', () => {
  let fixture: ComponentFixture<FooterComponent>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ContentService, useValue: createContentServiceMock() },
      ],
    });
    fixture = TestBed.createComponent(FooterComponent);
    await fixture.whenStable();
  });

  it('follows the editable profile name', () => {
    expect(fixture.nativeElement.textContent).toContain('Lucas Dixon');
  });

  it('links to the gallery and the source', () => {
    const hrefs = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('a')).map(
      (a) => a.getAttribute('href'),
    );

    expect(hrefs).toContain('/concepts');
    expect(hrefs.some((href) => href?.includes('github.com'))).toBe(true);
  });

  it('carries neither the share control nor the build stamp any more', () => {
    expect(fixture.nativeElement.querySelector('.share-link')).toBeNull();
    expect(fixture.nativeElement.querySelector('.version-badge')).toBeNull();
  });
});
