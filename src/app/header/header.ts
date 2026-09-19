/* header.ts
 *
 * The site's navigation bar. Adapted from ilc-members-manager's header: same
 * structure (title on the left, actions on the right, profile menu at the far
 * right) minus the breadcrumb accordion and offline machinery, neither of
 * which a four-page site needs.
 *
 * Links are plain <a href> elements. The App component intercepts clicks on
 * same-origin anchors and routes them without a reload, so these behave as SPA
 * navigation while still being real, copyable, middle-clickable links.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FirebaseStateService } from '../firebase-state.service';
import { RoutingService } from '../routing.service';
import { AppPathPatterns, Views } from '../app.config';
import { IconComponent } from '../icons/icon.component';
import { ProfileMenuComponent } from '../profile-menu/profile-menu';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [IconComponent, ProfileMenuComponent],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  public firebaseState = inject(FirebaseStateService);
  public routingService: RoutingService<AppPathPatterns> = inject(RoutingService);

  protected Views = Views;
  protected menuOpen = signal(false);

  protected isLoggedIn = computed(() => !!this.firebaseState.user());
  protected isAdmin = this.firebaseState.isAdmin;
  protected currentView = this.routingService.matchedPatternId;

  protected homeHref = computed(() => this.routingService.hrefForView(Views.Home));
  protected conceptsHref = computed(() => this.routingService.hrefForView(Views.Concepts));
  protected newConceptHref = computed(() => this.routingService.hrefForView(Views.ConceptNew));

  /**
   * The gallery has its own "New concept" button next to its heading, so the
   * header's would be a second copy of the same control in the same corner of
   * the screen. Show the header's everywhere else.
   */
  protected showNewConceptAction = computed(
    () => this.isAdmin() && this.currentView() !== Views.Concepts,
  );

  /** Highlights the Concepts tab on the gallery and on any single concept page. */
  protected isConceptsSection = computed(() => {
    const view = this.currentView();
    return (
      view === Views.Concepts ||
      view === Views.ConceptView ||
      view === Views.ConceptNew ||
      view === Views.ConceptEdit
    );
  });

  /**
   * The current URL, encoded for the login page's `returnUrl`, so that signing
   * in from a concept page comes back to that concept rather than to Home.
   */
  protected loginHref = computed(() => {
    let path = window.location.pathname + window.location.search;
    if (path.startsWith('/')) path = path.substring(1);
    return `/login?returnUrl=${encodeURIComponent(path)}`;
  });
}
