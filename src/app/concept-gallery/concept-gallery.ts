/* concept-gallery.ts
 *
 * The gallery: every concept as a card, with a text filter and a tag filter.
 *
 * Both filters live in the URL (`?q=` and `?tag=`), via the routing service's
 * typed param signals, so a filtered view can be linked to and survives a
 * reload — the same convention the list pages in ilc-members-manager use.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ContentService } from '../content.service';
import { FirebaseStateService } from '../firebase-state.service';
import { RoutingService } from '../routing.service';
import { AppPathPatterns, Views } from '../app.config';
import { ConceptCardComponent } from '../concept-card/concept-card';
import { MarkdownViewer } from '../markdown-editor/markdown-viewer';
import { IconComponent } from '../icons/icon.component';
import { Concept } from '../data-model/concept';

@Component({
  selector: 'app-concept-gallery',
  standalone: true,
  imports: [ConceptCardComponent, MarkdownViewer, IconComponent],
  templateUrl: './concept-gallery.html',
  styleUrl: './concept-gallery.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConceptGalleryComponent {
  protected content = inject(ContentService);
  protected firebaseState = inject(FirebaseStateService);
  protected routingService: RoutingService<AppPathPatterns> = inject(RoutingService);

  protected isAdmin = this.firebaseState.isAdmin;
  protected allTags = this.content.allTags;
  protected conceptsLoaded = this.content.conceptsLoaded;
  protected conceptsError = this.content.conceptsError;

  private params = this.routingService.signals[Views.Concepts].urlParams;
  protected query = this.params.q;
  protected selectedTag = this.params.tag;

  protected newConceptHref = computed(() => this.routingService.hrefForView(Views.ConceptNew));

  /** Concepts matching both filters. Search covers title, summary and tags —
   * not the body, which would need an index to do honestly at any size. */
  protected filteredConcepts = computed<Concept[]>(() => {
    const needle = this.query().trim().toLowerCase();
    const tag = this.selectedTag();
    return this.content.concepts().filter((concept) => {
      if (tag && !concept.tags.includes(tag)) return false;
      if (!needle) return true;
      return (
        concept.title.toLowerCase().includes(needle) ||
        concept.summary.toLowerCase().includes(needle) ||
        concept.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });
  });

  protected publishedConcepts = computed(() => this.filteredConcepts().filter((c) => c.published));

  /** Drafts are only ever non-empty for an admin: the rules see to that. */
  protected draftConcepts = computed(() => this.filteredConcepts().filter((c) => !c.published));

  protected hasFilters = computed(() => !!this.query().trim() || !!this.selectedTag());

  protected setQuery(value: string) {
    this.query.set(value);
  }

  /** Clicking the selected tag again clears it — a toggle, not a one-way trip. */
  protected toggleTag(tag: string) {
    this.selectedTag.set(this.selectedTag() === tag ? '' : tag);
  }

  protected clearFilters() {
    this.query.set('');
    this.selectedTag.set('');
  }
}
