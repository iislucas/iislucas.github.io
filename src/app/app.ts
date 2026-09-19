/* app.ts
 *
 * The application root: renders the header, switches on the matched route, and
 * turns same-origin anchor clicks into client-side navigation.
 *
 * The click interception (carried over from ilc-members-manager) is what lets
 * every link in the app be a plain `<a href>` — copyable, middle-clickable,
 * and crawlable — while still navigating without a page load.
 */

import { Component, computed, effect, HostListener, inject } from '@angular/core';
import { FirebaseStateService, LoginStatus } from './firebase-state.service';
import { RoutingService } from './routing.service';
import { ADMIN_VIEWS, AppPathPatterns, Views } from './app.config';
import { HeaderComponent } from './header/header';
import { HomeComponent } from './home/home';
import { ConceptGalleryComponent } from './concept-gallery/concept-gallery';
import { ConceptViewComponent } from './concept-view/concept-view';
import { ConceptEditComponent } from './concept-edit/concept-edit';
import { ProfileEditComponent } from './profile-edit/profile-edit';
import { LoginComponent } from './login/login';
import { NotFoundComponent } from './not-found/not-found';
import { FooterComponent } from './footer/footer';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    HeaderComponent,
    HomeComponent,
    ConceptGalleryComponent,
    ConceptViewComponent,
    ConceptEditComponent,
    ProfileEditComponent,
    LoginComponent,
    NotFoundComponent,
    FooterComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected firebaseState = inject(FirebaseStateService);
  protected routingService: RoutingService<AppPathPatterns> = inject(RoutingService);

  protected Views = Views;
  protected currentView = computed(() => this.routingService.matchedPatternId() as Views | null);
  protected isNotFound = computed(() => this.currentView() === null);

  /**
   * An admin-only route reached while signed out. We wait for auth to resolve
   * before deciding — otherwise a returning admin gets bounced to the login
   * page during the moment before Firebase reports their session.
   */
  protected isAwaitingAuth = computed(
    () => this.firebaseState.loginStatus() === LoginStatus.Loading,
  );

  constructor() {
    // Keep the document title in step with the view; it is what shows in tabs,
    // history and bookmarks.
    effect(() => {
      const view = this.currentView();
      const titles: Partial<Record<Views, string>> = {
        [Views.Home]: 'Lucas Dixon',
        [Views.Concepts]: 'Concept Gallery — Lucas Dixon',
        [Views.ConceptNew]: 'New concept — Lucas Dixon',
        [Views.ConceptEdit]: 'Edit concept — Lucas Dixon',
        [Views.ProfileEdit]: 'Edit landing page — Lucas Dixon',
        [Views.Login]: 'Sign in — Lucas Dixon',
      };
      document.title = view ? (titles[view] ?? 'Lucas Dixon') : 'Not found — Lucas Dixon';
    });

    // Send a signed-out visitor away from an admin-only page rather than
    // rendering an editor they cannot save. The rules would refuse the write
    // anyway; this just makes the refusal legible.
    effect(() => {
      const view = this.currentView();
      const status = this.firebaseState.loginStatus();
      if (!view || !ADMIN_VIEWS.has(view)) return;
      if (status !== LoginStatus.SignedOut) return;
      const current = (window.location.pathname + window.location.search).replace(/^\/+/, '');
      this.routingService.navigateTo(`login?returnUrl=${encodeURIComponent(current)}`);
    });
  }

  /**
   * Routes clicks on in-app links without a page load. Anything that is not a
   * plain left-click on a same-origin link — new tab, download, external host,
   * mailto — is left to the browser.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const anchor = (event.target as HTMLElement | null)?.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    if (
      href.startsWith('http') ||
      href.startsWith('//') ||
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      anchor.hasAttribute('download') ||
      anchor.getAttribute('target') === '_blank' ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();
    this.routingService.navigateTo(href.replace(/^\/+/, ''));
  }
}
