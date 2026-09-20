/* navigation-tree.ts
 *
 * The single source of truth for "where am I, and what is above me?".
 *
 * Carried over from ilc-members-manager, and cut down to this site's four
 * views. The site is a tree — a concept sits under the gallery, which sits
 * under the home page — and two things have to agree with that shape:
 *
 *   - the breadcrumb trail in the nav bar, which shows the whole path, and
 *   - the back button beside it, which goes exactly one level up.
 *
 * Both come from `ancestors()` here, so they cannot disagree. The document
 * title comes from `currentTitle()` for the same reason.
 *
 * Ancestor URLs are built with the routing service, so the gallery's own
 * search text and tag filter survive a trip into a concept and back out.
 */

import { computed, inject, Injectable } from '@angular/core';
import { RoutingService } from './routing.service';
import { AppPathPatterns, Views } from './app.config';
import { ContentService } from './content.service';

// One page in the tree. A node with no `url` is the page you are on.
export interface NavNode {
  label: string;
  url?: string;
  // True while the page is still fetching the record it is named after, so the
  // trail can show a placeholder rather than flicker from slug to title.
  isLoading?: boolean;
}

@Injectable({ providedIn: 'root' })
export class NavigationTreeService {
  private routing: RoutingService<AppPathPatterns> = inject(RoutingService);
  private content = inject(ContentService);

  public currentView = computed(() => this.routing.matchedPatternId() as Views | null);

  // The owner's name doubles as the name of the site, and it is editable, so
  // it is read from the profile rather than hardcoded.
  public siteName = computed(() => this.content.profile().name || 'Lucas Dixon');

  // The root of the tree: the home page, always the first crumb.
  public root = computed<NavNode>(() => ({
    label: this.siteName(),
    url: this.routing.hrefForView(Views.Home),
  }));

  // A concept is named after a record that arrives with the content snapshot,
  // so until it does there is nothing to show but the slug.
  private conceptTitle = computed(() => {
    const slug = this.routing.signals[Views.ConceptView].pathVars.slug();
    return this.content.concepts().find((concept) => concept.slug === slug)?.title ?? null;
  });

  /** Everything between the root and the current page, nearest last. */
  public ancestors = computed<NavNode[]>(() => {
    if (this.currentView() === Views.ConceptView) {
      return [{ label: 'Concept Gallery', url: this.routing.hrefForView(Views.Concepts) }];
    }
    return [];
  });

  /** The page one level up, or null at the root. */
  public parent = computed<NavNode | null>(() => this.ancestors().at(-1) ?? null);

  public isHome = computed(() => this.currentView() === Views.Home);

  /**
   * Where the nav bar's back button goes: nowhere at the root, the immediate
   * ancestor when there is one, and the root for every other top-level page.
   */
  public upNode = computed<NavNode | null>(() => {
    if (this.isHome()) return null;
    return this.parent() ?? this.root();
  });

  /** The name of the page being viewed; also the document title. */
  public currentTitle = computed(() => {
    switch (this.currentView()) {
      case Views.Home:
        return this.siteName();
      case Views.Concepts:
        return 'Concept Gallery';
      case Views.ConceptView:
        return this.conceptTitle() ?? this.routing.signals[Views.ConceptView].pathVars.slug();
      case Views.Login:
        return 'Sign in';
      default:
        return 'Page not found';
    }
  });

  public currentTitleIsLoading = computed(
    () => this.currentView() === Views.ConceptView && !this.content.conceptsLoaded(),
  );

  /** The full trail: the root, the ancestors, then the current page. */
  public breadcrumbs = computed<NavNode[]>(() => {
    // At the root the site name is the page, not a link to somewhere else.
    if (this.isHome()) return [{ label: this.siteName() }];
    return [
      this.root(),
      ...this.ancestors(),
      { label: this.currentTitle(), isLoading: this.currentTitleIsLoading() },
    ];
  });

  /** What goes in the browser tab: the page, then the site it belongs to. */
  public documentTitle = computed(() => {
    const title = this.currentTitle();
    const site = this.siteName();
    return title === site ? site : `${title} — ${site}`;
  });
}
