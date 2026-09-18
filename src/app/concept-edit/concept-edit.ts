/* concept-edit.ts
 *
 * Create and edit a concept. One component serves both: the route decides
 * whether there is an existing slug to load (`/concepts/:slug/edit`) or a new
 * concept to build (`/concepts/new`).
 *
 * The body is edited with the vendored <app-markdown-editor> (see
 * vendor/README.md). Image uploads are handed an explicit uploader that writes
 * under `images/` in Cloud Storage, matching storage.rules — the editor's own
 * default writes elsewhere, so passing this in is what keeps the two in step.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from 'firebase/storage';
import { ContentService } from '../content.service';
import { FirebaseStateService } from '../firebase-state.service';
import { RoutingService } from '../routing.service';
import { AppPathPatterns, RESERVED_SLUGS, Views } from '../app.config';
import { MarkdownEditor } from '../markdown-editor/markdown-editor';
import { IconComponent } from '../icons/icon.component';
import { Concept, initConcept, slugify } from '../data-model/concept';

@Component({
  selector: 'app-concept-edit',
  standalone: true,
  imports: [FormsModule, MarkdownEditor, IconComponent],
  templateUrl: './concept-edit.html',
  styleUrl: './concept-edit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConceptEditComponent {
  private content = inject(ContentService);
  private firebaseState = inject(FirebaseStateService);
  protected routingService: RoutingService<AppPathPatterns> = inject(RoutingService);

  protected isAdmin = this.firebaseState.isAdmin;
  protected isNew = computed(() => this.routingService.matchedPatternId() === Views.ConceptNew);

  private routeSlug = this.routingService.signals[Views.ConceptEdit].pathVars.slug;

  /** The working copy. Every field below edits this, and only Save writes it. */
  protected draft = signal<Concept>(initConcept());
  protected loaded = signal(false);
  protected saving = signal(false);
  protected errorMessage = signal<string | null>(null);
  protected slugTouched = signal(false);
  protected tagsText = signal('');
  protected confirmingDelete = signal(false);

  /**
   * The editor is seeded once with the loaded markdown and thereafter owns its
   * own document — re-feeding it on every keystroke would fight the cursor.
   * This snapshot is what gets passed to `initialValue`.
   */
  protected initialMarkdown = signal('');

  protected galleryHref = computed(() => this.routingService.hrefForView(Views.Concepts));

  protected viewHref = computed(() =>
    this.draft().slug
      ? this.routingService.hrefForView(Views.ConceptView, { slug: this.draft().slug })
      : this.galleryHref(),
  );

  protected canSave = computed(
    () => !this.saving() && !!this.draft().title.trim() && !!this.draft().slug.trim(),
  );

  constructor() {
    // Load the concept named by the route once the snapshot has arrived. An
    // untracked write keeps this from re-entering when `draft` changes.
    effect(() => {
      const isNew = this.isNew();
      const slug = this.routeSlug();
      const conceptsLoaded = this.content.conceptsLoaded();

      untracked(() => {
        if (this.loaded()) return;
        if (isNew) {
          this.draft.set(initConcept());
          this.initialMarkdown.set('');
          this.tagsText.set('');
          this.loaded.set(true);
          return;
        }
        if (!conceptsLoaded) return;
        const existing = this.content.concepts().find((c) => c.slug === slug);
        if (existing) {
          this.draft.set({ ...existing });
          this.initialMarkdown.set(existing.markdown);
          this.tagsText.set(existing.tags.join(', '));
        } else {
          this.errorMessage.set(`No concept found at /concepts/${slug}.`);
        }
        this.loaded.set(true);
      });
    });
  }

  protected updateField<K extends keyof Concept>(key: K, value: Concept[K]) {
    this.draft.set({ ...this.draft(), [key]: value });
  }

  /**
   * While creating, the slug follows the title until the slug is edited by
   * hand. Once a concept exists its slug is its document id and its URL, so it
   * is left alone — renaming would orphan every existing link.
   */
  protected onTitleChange(title: string) {
    const next = { ...this.draft(), title };
    if (this.isNew() && !this.slugTouched()) {
      next.slug = slugify(title);
    }
    this.draft.set(next);
  }

  protected onSlugChange(slug: string) {
    this.slugTouched.set(true);
    this.updateField('slug', slugify(slug));
  }

  protected onTagsChange(text: string) {
    this.tagsText.set(text);
    const tags = text
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t !== '');
    this.updateField('tags', tags);
  }

  /** Uploads editor images to `images/`, which storage.rules makes writable to
   * admins and readable to everyone. */
  protected imageUploader = async (blob: Blob, meta: { originalFile?: File }): Promise<string> => {
    const name = meta.originalFile?.name ?? 'image.png';
    const path = `images/${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const fileRef = storageRef(getStorage(this.firebaseState.app), path);
    await uploadBytes(fileRef, blob, { contentType: blob.type || 'image/png' });
    return getDownloadURL(fileRef);
  };

  protected async save() {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.errorMessage.set(null);

    // A reserved slug would be shadowed by a route of the same name, leaving
    // the concept saved but unreachable.
    if (RESERVED_SLUGS.has(this.draft().slug)) {
      this.saving.set(false);
      this.errorMessage.set(
        `"${this.draft().slug}" is reserved by a page of the same name. Choose a different URL slug.`,
      );
      return;
    }

    // Creating over an existing slug would silently replace that concept.
    if (this.isNew() && (await this.content.slugExists(this.draft().slug))) {
      this.saving.set(false);
      this.errorMessage.set(
        `A concept already exists at /concepts/${this.draft().slug}. Choose a different URL slug.`,
      );
      return;
    }

    const result = await this.content.saveConcept(this.draft());
    this.saving.set(false);
    if (!result.success) {
      this.errorMessage.set(result.message);
      return;
    }
    this.routingService.navigateTo(`concepts/${this.draft().slug}`);
  }

  protected async deleteConcept() {
    this.saving.set(true);
    const result = await this.content.deleteConcept(this.draft().slug);
    this.saving.set(false);
    if (!result.success) {
      this.confirmingDelete.set(false);
      this.errorMessage.set(result.message);
      return;
    }
    this.routingService.navigateTo('concepts');
  }
}
