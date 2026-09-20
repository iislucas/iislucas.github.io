/* app.ts
 *
 * The application root: renders the header, switches on the matched route, and
 * turns same-origin anchor clicks into client-side navigation.
 *
 * The click interception (carried over from ilc-members-manager) is what lets
 * every link in the app be a plain `<a href>` — copyable, middle-clickable,
 * and crawlable — while still navigating without a page load.
 */

import { Component, computed, effect, HostListener, inject, untracked } from '@angular/core';
import { RoutingService } from './routing.service';
import { AppPathPatterns, Views } from './app.config';
import { HeaderComponent } from './header/header';
import { HomeComponent } from './home/home';
import { ConceptGalleryComponent } from './concept-gallery/concept-gallery';
import { ConceptViewComponent } from './concept-view/concept-view';
import { LoginComponent } from './login/login';
import { NotFoundComponent } from './not-found/not-found';
import { FooterComponent } from './footer/footer';
import { EditModeService } from './edit-mode/edit-mode.service';
import { ThemeService } from './theme/theme.service';
import { NavigationTreeService } from './navigation-tree';
import { APP_VERSION } from './version';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    HeaderComponent,
    HomeComponent,
    ConceptGalleryComponent,
    ConceptViewComponent,
    LoginComponent,
    NotFoundComponent,
    FooterComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected routingService: RoutingService<AppPathPatterns> = inject(RoutingService);
  private editMode = inject(EditModeService);
  // Injected for its constructor: it puts the visitor's saved theme on the
  // document before anything is rendered, so the page never flashes another.
  private themes = inject(ThemeService);
  private navTree = inject(NavigationTreeService);

  protected Views = Views;
  // Which build this page came from, floated in the corner. See
  // scripts/stamp-version.mjs.
  protected appVersion = APP_VERSION;
  protected currentView = computed(() => this.routingService.matchedPatternId() as Views | null);
  protected isNotFound = computed(() => this.currentView() === null);

  constructor() {
    // Keep the document title in step with the view; it is what shows in tabs,
    // history and bookmarks. It comes from the same navigation tree as the
    // breadcrumbs, so the tab and the nav bar always agree — including on a
    // concept page, where the title only arrives with the content.
    effect(() => {
      document.title = this.navTree.documentTitle();
    });

    // A half-finished edit or selection does not follow you to another page.
    effect(() => {
      this.currentView();
      this.routingService.signals[Views.ConceptView].pathVars.slug();
      untracked(() => this.editMode.clearSelection());
    });
  }

  /**
   * Routes clicks on in-app links without a page load. Anything that is not a
   * plain left-click on a same-origin link — new tab, download, external host,
   * mailto — is left to the browser.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    // Something on the page already handled this click — in edit mode, a tap
    // on a linked title edits it rather than following the link.
    if (event.defaultPrevented) return;
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
