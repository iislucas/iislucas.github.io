/* profile-edit.ts
 *
 * Edits the landing page: name, tagline, portrait, outbound links, the bio
 * body, the favourite papers, and the blurb that introduces the Concept
 * Gallery.
 *
 * Same shape as concept-edit — a working copy in a signal, written only on
 * Save — so that leaving the page without saving changes nothing.
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
import { AppPathPatterns, Views } from '../app.config';
import { MarkdownEditor } from '../markdown-editor/markdown-editor';
import { IconComponent } from '../icons/icon.component';
import {
  FavouritePaper,
  initFavouritePaper,
  paperLinks,
  Profile,
  ProfileLink,
} from '../data-model/profile';

@Component({
  selector: 'app-profile-edit',
  standalone: true,
  imports: [FormsModule, MarkdownEditor, IconComponent],
  templateUrl: './profile-edit.html',
  styleUrl: './profile-edit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileEditComponent {
  private content = inject(ContentService);
  private firebaseState = inject(FirebaseStateService);
  protected routingService: RoutingService<AppPathPatterns> = inject(RoutingService);

  protected isAdmin = this.firebaseState.isAdmin;

  protected draft = signal<Profile>(this.content.profile());
  protected loaded = signal(false);
  protected saving = signal(false);
  protected errorMessage = signal<string | null>(null);

  // Seeded once, for the same reason as in concept-edit: the editors own their
  // documents after the first render.
  protected initialBio = signal('');
  protected initialGalleryIntro = signal('');
  protected initialPapersIntro = signal('');

  // Each paper paired with the links it currently resolves to, so the form can
  // show what a given arXiv or Scholar id will actually point at.
  protected draftPapers = computed(() => {
    const draft = this.draft();
    return draft.favouritePapers.map((paper) => ({
      paper,
      links: paperLinks(paper, draft.scholarUserId),
    }));
  });

  protected homeHref = computed(() => this.routingService.hrefForView(Views.Home));

  constructor() {
    effect(() => {
      const profileLoaded = this.content.profileLoaded();
      const profile = this.content.profile();
      untracked(() => {
        if (this.loaded() || !profileLoaded) return;
        this.draft.set({
          ...profile,
          links: profile.links.map((l) => ({ ...l })),
          favouritePapers: profile.favouritePapers.map((p) => ({ ...p })),
        });
        this.initialBio.set(profile.bioMarkdown);
        this.initialGalleryIntro.set(profile.galleryIntroMarkdown);
        this.initialPapersIntro.set(profile.favouritePapersIntroMarkdown);
        this.loaded.set(true);
      });
    });
  }

  protected updateField<K extends keyof Profile>(key: K, value: Profile[K]) {
    this.draft.set({ ...this.draft(), [key]: value });
  }

  protected addLink() {
    this.updateField('links', [...this.draft().links, { label: '', url: '' }]);
  }

  protected updateLink(index: number, field: keyof ProfileLink, value: string) {
    const links = this.draft().links.map((link, i) =>
      i === index ? { ...link, [field]: value } : link,
    );
    this.updateField('links', links);
  }

  protected removeLink(index: number) {
    this.updateField(
      'links',
      this.draft().links.filter((_, i) => i !== index),
    );
  }

  protected moveLink(index: number, delta: number) {
    const links = [...this.draft().links];
    const target = index + delta;
    if (target < 0 || target >= links.length) return;
    [links[index], links[target]] = [links[target], links[index]];
    this.updateField('links', links);
  }

  protected addPaper() {
    this.updateField('favouritePapers', [...this.draft().favouritePapers, initFavouritePaper()]);
  }

  protected updatePaper(index: number, field: keyof FavouritePaper, value: string) {
    const papers = this.draft().favouritePapers.map((paper, i) =>
      i === index ? { ...paper, [field]: value } : paper,
    );
    this.updateField('favouritePapers', papers);
  }

  protected removePaper(index: number) {
    this.updateField(
      'favouritePapers',
      this.draft().favouritePapers.filter((_, i) => i !== index),
    );
  }

  protected movePaper(index: number, delta: number) {
    const papers = [...this.draft().favouritePapers];
    const target = index + delta;
    if (target < 0 || target >= papers.length) return;
    [papers[index], papers[target]] = [papers[target], papers[index]];
    this.updateField('favouritePapers', papers);
  }

  protected imageUploader = async (blob: Blob, meta: { originalFile?: File }): Promise<string> => {
    const name = meta.originalFile?.name ?? 'image.png';
    const path = `images/${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const fileRef = storageRef(getStorage(this.firebaseState.app), path);
    await uploadBytes(fileRef, blob, { contentType: blob.type || 'image/png' });
    return getDownloadURL(fileRef);
  };

  protected async save() {
    this.saving.set(true);
    this.errorMessage.set(null);
    // Drop links with no URL and papers with no title: an empty row is an
    // abandoned edit, not content.
    const toSave: Profile = {
      ...this.draft(),
      links: this.draft().links.filter((l) => l.url.trim() !== ''),
      favouritePapers: this.draft().favouritePapers.filter((p) => p.title.trim() !== ''),
    };
    const result = await this.content.saveProfile(toSave);
    this.saving.set(false);
    if (!result.success) {
      this.errorMessage.set(result.message);
      return;
    }
    this.routingService.navigateTo('');
  }
}
