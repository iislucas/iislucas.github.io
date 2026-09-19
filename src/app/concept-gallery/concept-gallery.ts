/* concept-gallery.ts
 *
 * The gallery: every concept as a card, with a text filter and a tag filter.
 *
 * Both filters live in the URL (`?q=` and `?tag=`), via the routing service's
 * typed param signals, so a filtered view can be linked to and survives a
 * reload — the same convention the list pages in ilc-members-manager use.
 *
 * In edit mode an admin can also edit the gallery's introduction in place and
 * start a new concept: it is created as an unpublished draft with just a
 * title, and the new concept's own page is where the rest is filled in.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ContentService } from '../content.service';
import { FirebaseStateService } from '../firebase-state.service';
import { RoutingService } from '../routing.service';
import { AppPathPatterns, Views } from '../app.config';
import { ConceptCardComponent } from '../concept-card/concept-card';
import { MarkdownViewer } from '../markdown-editor/markdown-viewer';
import { IconComponent } from '../icons/icon.component';
import { Concept, slugify } from '../data-model/concept';
import { Profile } from '../data-model/profile';
import { EditModeService } from '../edit-mode/edit-mode.service';
import {
  EditableFieldComponent,
  EditKind,
  MarkdownImageUploader,
} from '../edit-mode/editable-field/editable-field';
import { uploadImage } from '../image-storage';

@Component({
  selector: 'app-concept-gallery',
  standalone: true,
  imports: [ConceptCardComponent, MarkdownViewer, IconComponent, EditableFieldComponent],
  templateUrl: './concept-gallery.html',
  styleUrl: './concept-gallery.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConceptGalleryComponent {
  protected content = inject(ContentService);
  protected firebaseState = inject(FirebaseStateService);
  protected routingService: RoutingService<AppPathPatterns> = inject(RoutingService);
  protected editMode = inject(EditModeService);

  protected EditKind = EditKind;
  protected editing = this.editMode.active;
  protected allTags = this.content.allTags;
  protected conceptsLoaded = this.content.conceptsLoaded;
  protected conceptsError = this.content.conceptsError;

  private params = this.routingService.signals[Views.Concepts].urlParams;
  protected query = this.params.q;
  protected selectedTag = this.params.tag;

  // The "new concept" form: open or not, the title typed so far, and the
  // outcome of the last attempt.
  protected creating = signal(false);
  protected newTitle = signal('');
  protected createBusy = signal(false);
  protected createError = signal<string | null>(null);
  protected newSlug = computed(() => slugify(this.newTitle()));

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

  protected commitIntro = (value: string) =>
    this.content.updateProfile({ galleryIntroMarkdown: value } satisfies Partial<Profile>);

  protected markdownUploader: MarkdownImageUploader = (blob, meta) =>
    uploadImage(this.firebaseState.app, blob, 'gallery', meta.originalFile?.name ?? 'image.png');

  protected startCreating() {
    this.newTitle.set('');
    this.createError.set(null);
    this.creating.set(true);
  }

  protected cancelCreating() {
    this.creating.set(false);
  }

  protected onNewTitleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.createConcept();
    } else if (event.key === 'Escape') {
      this.cancelCreating();
    }
  }

  /** Creates the draft and goes to its page, still in edit mode, to fill it in. */
  protected async createConcept() {
    const title = this.newTitle().trim();
    if (!title || this.createBusy()) return;
    this.createBusy.set(true);
    this.createError.set(null);
    const result = await this.content.createConcept(title);
    this.createBusy.set(false);
    if (!result.success) {
      this.createError.set(result.message);
      return;
    }
    this.creating.set(false);
    this.routingService.navigateTo(`concepts/${result.slug}`);
  }
}
