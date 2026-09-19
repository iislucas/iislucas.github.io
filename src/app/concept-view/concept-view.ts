/* concept-view.ts
 *
 * A single concept, read from the slug in the URL.
 *
 * The concept comes from the already-live ContentService list rather than its
 * own fetch, so opening one from the gallery is instant and an edit made in
 * another tab shows up here without a reload. That also means "not in the
 * list" is only meaningful once the first snapshot has arrived — hence the
 * check against `conceptsLoaded()` before showing the not-found state.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ContentService } from '../content.service';
import { FirebaseStateService } from '../firebase-state.service';
import { RoutingService } from '../routing.service';
import { AppPathPatterns, Views } from '../app.config';
import { MarkdownViewer } from '../markdown-editor/markdown-viewer';
import { IconComponent } from '../icons/icon.component';

@Component({
  selector: 'app-concept-view',
  standalone: true,
  imports: [MarkdownViewer, IconComponent],
  templateUrl: './concept-view.html',
  styleUrl: './concept-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConceptViewComponent {
  protected content = inject(ContentService);
  protected firebaseState = inject(FirebaseStateService);
  protected routingService: RoutingService<AppPathPatterns> = inject(RoutingService);

  protected isAdmin = this.firebaseState.isAdmin;
  protected conceptsLoaded = this.content.conceptsLoaded;

  protected slug = this.routingService.signals[Views.ConceptView].pathVars.slug;

  protected concept = computed(() => this.content.concepts().find((c) => c.slug === this.slug()));

  protected notFound = computed(() => this.conceptsLoaded() && !this.concept());

  protected galleryHref = computed(() => this.routingService.hrefForView(Views.Concepts));

  protected editHref = computed(() =>
    this.routingService.hrefForView(Views.ConceptEdit, { slug: this.slug() }),
  );

  /** Tag links go back to the gallery with that tag already selected. */
  protected tagHref(tag: string): string {
    return this.routingService.hrefForView(Views.Concepts, { tag, q: '' });
  }
}
