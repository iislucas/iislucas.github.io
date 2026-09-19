/* home.ts
 *
 * The landing (About) page: the profile header, the bio, the favourite
 * papers, and a teaser of the Concept Gallery.
 *
 * Everything on it is editable in place when an admin turns on edit mode (see
 * edit-mode/edit-mode.service.ts): each field is wrapped in an
 * <app-editable-field> or <app-editable-image>, and the links and papers are
 * lists of <app-editable-list-item>. Each accepted change is written straight
 * to the profile document; this component supplies the functions that do the
 * writing, and records an undo for the list operations it performs itself.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ContentService, SaveResult } from '../content.service';
import { FirebaseStateService } from '../firebase-state.service';
import { MarkdownViewer } from '../markdown-editor/markdown-viewer';
import { IconComponent } from '../icons/icon.component';
import { RoutingService } from '../routing.service';
import { AppPathPatterns, Views } from '../app.config';
import { ConceptCardComponent } from '../concept-card/concept-card';
import {
  FavouritePaper,
  initFavouritePaper,
  paperLinks,
  Profile,
  ProfileLink,
  scholarProfileUrl,
} from '../data-model/profile';
import { EditModeService } from '../edit-mode/edit-mode.service';
import {
  EditableFieldComponent,
  EditKind,
  MarkdownImageUploader,
} from '../edit-mode/editable-field/editable-field';
import { EditableImageComponent, ImageUrls } from '../edit-mode/editable-image/editable-image';
import { EditableListItemComponent } from '../edit-mode/editable-list-item/editable-list-item';
import { insertAt, moveItem, removeAt, replaceAt } from '../edit-mode/list-ops';
import { uploadImage } from '../image-storage';

// How many concepts the landing page previews before sending you to the gallery.
const PREVIEW_COUNT = 3;

// Where images for this page are uploaded, under `images/`.
const PROFILE_IMAGE_FOLDER = 'profile';

// The profile's plain-text and markdown fields: the ones a single
// <app-editable-field> edits directly.
type ProfileTextField = {
  [K in keyof Profile]: Profile[K] extends string ? K : never;
}[keyof Profile];

// A list on the profile that is edited entry by entry.
enum ProfileList {
  Links = 'links',
  Papers = 'favouritePapers',
}

// What a new entry starts as. Each needs something in it: an entry with no
// title (paper) or no label and no URL (link) is dropped when read back.
const NEW_PAPER_TITLE = 'New paper';
const NEW_LINK_LABEL = 'New link';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    MarkdownViewer,
    IconComponent,
    ConceptCardComponent,
    EditableFieldComponent,
    EditableImageComponent,
    EditableListItemComponent,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  protected content = inject(ContentService);
  protected firebaseState = inject(FirebaseStateService);
  protected editMode = inject(EditModeService);
  private routingService: RoutingService<AppPathPatterns> = inject(RoutingService);

  protected EditKind = EditKind;
  protected profileImageFolder = PROFILE_IMAGE_FOLDER;
  protected isAdmin = this.firebaseState.isAdmin;
  protected editing = this.editMode.active;
  protected profile = this.content.profile;
  protected profileLoaded = this.content.profileLoaded;

  protected conceptsHref = computed(() => this.routingService.hrefForView(Views.Concepts));

  /** Published concepts only, however the viewer is signed in — the landing
   * page is the public face of the site, so a draft never previews here. */
  protected previewConcepts = computed(() =>
    this.content
      .concepts()
      .filter((c) => c.published)
      .slice(0, PREVIEW_COUNT),
  );

  protected hasMoreConcepts = computed(
    () => this.content.concepts().filter((c) => c.published).length > PREVIEW_COUNT,
  );

  /** The favourite papers, each paired with the links it resolves to, so that
   * the template never has to work a link out for itself. */
  protected favouritePapers = computed(() => {
    const profile = this.profile();
    return profile.favouritePapers.map((paper) => ({
      paper,
      links: paperLinks(paper, profile.scholarUserId),
    }));
  });

  /** The Scholar profile, linked from the papers heading; '' when unset. */
  protected scholarHref = computed(() => scholarProfileUrl(this.profile().scholarUserId));

  /** True once loaded and genuinely empty — the cue to show setup guidance.
   * In edit mode the page itself is the way to fill it in, so it shows. */
  protected isUnseeded = computed(
    () =>
      this.profileLoaded() &&
      !this.editing() &&
      this.profile().name === '' &&
      this.profile().bioMarkdown === '',
  );

  protected markdownUploader: MarkdownImageUploader = (blob, meta) =>
    uploadImage(
      this.firebaseState.app,
      blob,
      PROFILE_IMAGE_FOLDER,
      meta.originalFile?.name ?? 'image.png',
    );

  protected savePhoto = (urls: ImageUrls): Promise<SaveResult> =>
    this.content.updateProfile({ photoUrl: urls.url, photoOriginalUrl: urls.originalUrl });

  // The commit functions handed to the editable fields, made once per field
  // so the template binds the same function on every render.
  private commits = new Map<string, (value: string) => Promise<SaveResult>>();

  private cachedCommit(
    key: string,
    make: () => (value: string) => Promise<SaveResult>,
  ): (value: string) => Promise<SaveResult> {
    let commit = this.commits.get(key);
    if (!commit) {
      commit = make();
      this.commits.set(key, commit);
    }
    return commit;
  }

  /** Writes one of the profile's own text fields. */
  protected profileCommit(field: ProfileTextField) {
    return this.cachedCommit(`profile.${field}`, () => (value) => {
      const update: Partial<Profile> = {};
      update[field] = value;
      return this.content.updateProfile(update);
    });
  }

  /** Writes one field of one paper, into the papers as they are at the time. */
  protected paperCommit(index: number, field: keyof FavouritePaper) {
    return this.cachedCommit(`paper.${index}.${field}`, () => (value) => {
      const papers = this.profile().favouritePapers;
      const paper = papers[index];
      if (!paper) return Promise.resolve(staleEntry('paper'));
      return this.content.updateProfile({
        favouritePapers: replaceAt(papers, index, { ...paper, [field]: value }),
      });
    });
  }

  /** Writes one field of one link. */
  protected linkCommit(index: number, field: keyof ProfileLink) {
    return this.cachedCommit(`link.${index}.${field}`, () => (value) => {
      const links = this.profile().links;
      const link = links[index];
      if (!link) return Promise.resolve(staleEntry('link'));
      return this.content.updateProfile({
        links: replaceAt(links, index, { ...link, [field]: value }),
      });
    });
  }

  protected movePaper(index: number, delta: number) {
    const papers = this.profile().favouritePapers;
    this.writeList(ProfileList.Papers, moveItem(papers, index, delta), 'Move paper');
    this.editMode.selectedItemId.set(`paper.${index + delta}`);
  }

  protected removePaper(index: number) {
    const papers = this.profile().favouritePapers;
    this.writeList(ProfileList.Papers, removeAt(papers, index), 'Delete paper');
  }

  protected async insertPaper(index: number) {
    const papers = this.profile().favouritePapers;
    const paper: FavouritePaper = { ...initFavouritePaper(), title: NEW_PAPER_TITLE };
    const result = await this.writeList(
      ProfileList.Papers,
      insertAt(papers, index, paper),
      'Add paper',
    );
    if (result.success) this.startEditing(`paper.${index}`, `paper.${index}.title`);
  }

  protected moveLink(index: number, delta: number) {
    this.writeList(ProfileList.Links, moveItem(this.profile().links, index, delta), 'Move link');
    this.editMode.selectedItemId.set(`link.${index + delta}`);
  }

  protected removeLink(index: number) {
    this.writeList(ProfileList.Links, removeAt(this.profile().links, index), 'Delete link');
  }

  protected async insertLink(index: number) {
    const link: ProfileLink = { label: NEW_LINK_LABEL, url: '' };
    const result = await this.writeList(
      ProfileList.Links,
      insertAt(this.profile().links, index, link),
      'Add link',
    );
    if (result.success) this.startEditing(`link.${index}`, `link.${index}.label`);
  }

  // Selects a just-added entry and opens its first field, text selected, so
  // that typing replaces the placeholder.
  private startEditing(itemId: string, fieldId: string) {
    this.editMode.selectedItemId.set(itemId);
    this.editMode.selectAllOnOpen.set(true);
    this.editMode.openFieldId.set(fieldId);
  }

  // Writes a whole list, and records how to put the previous one back.
  private async writeList<K extends ProfileList>(
    list: K,
    next: Profile[K],
    label: string,
  ): Promise<SaveResult> {
    const previous = this.profile()[list];
    const write = (value: Profile[K]) => {
      const update: Partial<Profile> = {};
      update[list] = value;
      return this.content.updateProfile(update);
    };
    const result = await write(next);
    if (result.success) {
      this.editMode.record({ targetId: `profile.${list}`, label, revert: () => write(previous) });
    } else {
      this.editMode.undoError.set(result.message);
    }
    return result;
  }
}

// The entry an edit was aimed at has gone — removed in another tab, or by an
// undo — so there is nothing left to write the edit into.
function staleEntry(what: string): SaveResult {
  return {
    success: false,
    message: `That ${what} is no longer in the list. Reload and try again.`,
  };
}
