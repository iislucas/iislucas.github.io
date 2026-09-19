/* concept-view.ts
 *
 * A single concept, read from the slug in the URL — and, for an admin in edit
 * mode, edited in place: every field is wrapped in an <app-editable-field>
 * (or <app-editable-image> for the hero image), and edit mode adds the
 * controls that have no place on the read-only page: publish / unpublish, the
 * gallery order, and delete.
 *
 * The concept comes from the already-live ContentService list rather than its
 * own fetch, so opening one from the gallery is instant and an edit made in
 * another tab shows up here without a reload. That also means "not in the
 * list" is only meaningful once the first snapshot has arrived — hence the
 * check against `conceptsLoaded()` before showing the not-found state.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ContentService, SaveResult } from '../content.service';
import { FirebaseStateService } from '../firebase-state.service';
import { RoutingService } from '../routing.service';
import { AppPathPatterns, Views } from '../app.config';
import { MarkdownViewer } from '../markdown-editor/markdown-viewer';
import { IconComponent } from '../icons/icon.component';
import { Concept, parseTags } from '../data-model/concept';
import { EditModeService } from '../edit-mode/edit-mode.service';
import {
  EditableFieldComponent,
  EditKind,
  MarkdownImageUploader,
} from '../edit-mode/editable-field/editable-field';
import { EditableImageComponent, ImageUrls } from '../edit-mode/editable-image/editable-image';
import { uploadImage } from '../image-storage';

// The concept fields held as plain text or markdown, each edited by a single
// <app-editable-field> as-is.
type ConceptTextField = 'title' | 'summary' | 'markdown' | 'acknowledgement';

@Component({
  selector: 'app-concept-view',
  standalone: true,
  imports: [MarkdownViewer, IconComponent, EditableFieldComponent, EditableImageComponent],
  templateUrl: './concept-view.html',
  styleUrl: './concept-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConceptViewComponent {
  protected content = inject(ContentService);
  protected firebaseState = inject(FirebaseStateService);
  protected editMode = inject(EditModeService);
  protected routingService: RoutingService<AppPathPatterns> = inject(RoutingService);

  protected EditKind = EditKind;
  protected editing = this.editMode.active;
  protected conceptsLoaded = this.content.conceptsLoaded;

  protected slug = this.routingService.signals[Views.ConceptView].pathVars.slug;

  protected concept = computed(() => this.content.concepts().find((c) => c.slug === this.slug()));

  protected notFound = computed(() => this.conceptsLoaded() && !this.concept());

  protected galleryHref = computed(() => this.routingService.hrefForView(Views.Concepts));

  // Where this concept's images go, under `images/`.
  protected imageFolder = computed(() => `concepts/${this.slug()}`);

  protected busy = signal(false);
  protected actionError = signal<string | null>(null);
  protected confirmingDelete = signal(false);

  /** Tag links go back to the gallery with that tag already selected. */
  protected tagHref(tag: string): string {
    return this.routingService.hrefForView(Views.Concepts, { tag, q: '' });
  }

  // Every write goes to the concept named by the URL at the time it is made.
  private update(changes: Partial<Concept>): Promise<SaveResult> {
    return this.content.updateConcept(this.slug(), changes);
  }

  // One commit function per field, made once, so the template binds the same
  // function on every render.
  private textCommits = new Map<ConceptTextField, (value: string) => Promise<SaveResult>>();

  protected commitText(field: ConceptTextField) {
    let commit = this.textCommits.get(field);
    if (!commit) {
      commit = (value: string) => {
        const changes: Partial<Concept> = {};
        changes[field] = value;
        return this.update(changes);
      };
      this.textCommits.set(field, commit);
    }
    return commit;
  }

  protected commitTags = (value: string) => this.update({ tags: parseTags(value) });

  protected commitOrder = (value: string): Promise<SaveResult> => {
    const order = Number(value);
    if (value.trim() === '' || !Number.isFinite(order)) {
      return Promise.resolve({ success: false, message: 'The order has to be a number.' });
    }
    return this.update({ order });
  };

  protected saveImage = (urls: ImageUrls) =>
    this.update({ imageUrl: urls.url, imageOriginalUrl: urls.originalUrl });

  protected markdownUploader: MarkdownImageUploader = (blob, meta) =>
    uploadImage(
      this.firebaseState.app,
      blob,
      this.imageFolder(),
      meta.originalFile?.name ?? 'image.png',
    );

  protected async togglePublished(concept: Concept) {
    const previous = concept.published;
    this.busy.set(true);
    this.actionError.set(null);
    const result = await this.update({ published: !previous });
    this.busy.set(false);
    if (!result.success) {
      this.actionError.set(result.message);
      return;
    }
    this.editMode.record({
      targetId: `concept.${concept.slug}.published`,
      label: previous ? 'Unpublish' : 'Publish',
      revert: () => this.content.updateConcept(concept.slug, { published: previous }),
    });
  }

  protected async deleteConcept() {
    this.busy.set(true);
    this.actionError.set(null);
    const result = await this.content.deleteConcept(this.slug());
    this.busy.set(false);
    this.confirmingDelete.set(false);
    if (!result.success) {
      this.actionError.set(result.message);
      return;
    }
    this.routingService.navigateTo('concepts');
  }
}
