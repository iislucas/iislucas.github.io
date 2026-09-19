/* header.ts
 *
 * The site's navigation bar. Adapted from ilc-members-manager's header: same
 * structure (title on the left, actions on the right, profile menu at the far
 * right) minus the breadcrumb accordion and offline machinery, neither of
 * which a four-page site needs.
 *
 * There is deliberately no "Sign in" link: signing in is only for the site's
 * editor, who knows where /login is. A visitor is never invited to.
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
import { EditModeService } from '../edit-mode/edit-mode.service';

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
  protected editMode = inject(EditModeService);

  protected Views = Views;
  protected menuOpen = signal(false);

  protected isLoggedIn = computed(() => !!this.firebaseState.user());
  protected isAdmin = this.firebaseState.isAdmin;
  protected currentView = this.routingService.matchedPatternId;

  protected homeHref = computed(() => this.routingService.hrefForView(Views.Home));
  protected conceptsHref = computed(() => this.routingService.hrefForView(Views.Concepts));

  /** Highlights the Concepts tab on the gallery and on any single concept page. */
  protected isConceptsSection = computed(() => {
    const view = this.currentView();
    return view === Views.Concepts || view === Views.ConceptView;
  });
}
