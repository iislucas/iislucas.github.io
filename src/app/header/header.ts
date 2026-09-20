/* header.ts
 *
 * The site's navigation bar. Adapted from ilc-members-manager's header: a back
 * button and the breadcrumb trail on the left, the section links and the
 * profile menu on the right, minus the offline machinery a four-page site has
 * no use for.
 *
 * Where you are is stated once, here: the parent crumbs sit above the page
 * title in the bar, so the page bodies do not repeat it. Both come from
 * NavigationTreeService, as does the back button, so the trail and the button
 * can never point at different places.
 *
 * Where you can go is behind the hamburger, as in ilc-members-manager, rather
 * than in tabs along the bar — which leaves the bar to say one thing. Unlike
 * upstream, the button is on every page and not just the home page: this menu
 * is the whole of the site's navigation, so it always has to be reachable.
 *
 * Signing in is only ever for the site's editor, so it is not advertised: the
 * "Sign in" entry is tucked at the bottom of the menu and disappears once you
 * are signed in. Accounts still cannot be created from it (see login.ts).
 *
 * The share button sits beside the avatar rather than in the footer, so that
 * sharing the page you are reading does not mean scrolling to the end of it.
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
import { NavigationTreeService } from '../navigation-tree';
import { isShared, sharePage } from '../share-page';

// How long the share button stays on its "done" tick before going back.
const COPIED_FEEDBACK_MS = 2000;

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
  protected navTree = inject(NavigationTreeService);

  protected Views = Views;
  protected menuOpen = signal(false);

  protected isLoggedIn = computed(() => !!this.firebaseState.user());
  protected isAdmin = this.firebaseState.isAdmin;
  protected currentView = this.routingService.matchedPatternId;

  protected homeHref = computed(() => this.routingService.hrefForView(Views.Home));
  protected conceptsHref = computed(() => this.routingService.hrefForView(Views.Concepts));
  protected loginHref = computed(() => this.routingService.hrefForView(Views.Login));

  /** The page's own URL, kept current by the router across in-app navigation. */
  protected currentUrl = this.routingService.currentUrl;
  protected shareCopied = signal(false);
  private copiedTimeout: ReturnType<typeof setTimeout> | null = null;

  protected upNode = this.navTree.upNode;

  // The trail above the title: everything but the page you are on.
  protected parentCrumbs = computed(() => this.navTree.breadcrumbs().slice(0, -1));
  protected currentCrumb = computed(() => this.navTree.breadcrumbs().at(-1) ?? null);

  /** Marks the Concepts entry on the gallery and on any single concept page. */
  protected isConceptsSection = computed(() => {
    const view = this.currentView();
    return view === Views.Concepts || view === Views.ConceptView;
  });

  // The menu closes on its own when something in it is chosen; the click then
  // navigates as any in-app link does.
  protected closeMenu() {
    this.menuOpen.set(false);
  }

  protected async share(event: MouseEvent) {
    // A plain left-click shares rather than navigating to the page we are on.
    // Modified clicks are left to the browser, so "open in new tab" still works.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const outcome = await sharePage(this.currentUrl(), document.title);
    if (!isShared(outcome)) return;

    this.shareCopied.set(true);
    if (this.copiedTimeout) clearTimeout(this.copiedTimeout);
    this.copiedTimeout = setTimeout(() => this.shareCopied.set(false), COPIED_FEEDBACK_MS);
  }
}
