/* editable-image.ts
 *
 * <app-editable-image>: an image an admin can replace, re-crop or remove in
 * place while edit mode is on. The counterpart of <app-editable-field> for
 * images, and built on the same cropper ilc-members-manager uses for event
 * hero images (<app-image-upload-preview>).
 *
 * Wrap the image as it is normally displayed; outside edit mode only that
 * shows. In edit mode, tapping it opens the cropper. The cropped image and the
 * uncropped original are both uploaded (under `images/<folder>/`), and their
 * URLs handed to `commit` — the original is what a later re-crop starts from,
 * so a crop never loses the rest of the picture.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { EditModeService } from '../edit-mode.service';
import { SaveResult } from '../../content.service';
import { FirebaseStateService } from '../../firebase-state.service';
import { IconComponent } from '../../icons/icon.component';
import { ImageUploadPreviewComponent } from '../../image-upload-preview/image-upload-preview';
import { SpinnerComponent } from '../../spinner/spinner.component';
import { uploadImage } from '../../image-storage';

export interface ImageUrls {
  // The cropped image that is displayed.
  url: string;
  // The uncropped upload it was cut from; '' when unknown.
  originalUrl: string;
}

export interface ImageSize {
  width: number;
  height: number;
}

@Component({
  selector: 'app-editable-image',
  standalone: true,
  imports: [IconComponent, ImageUploadPreviewComponent, SpinnerComponent],
  templateUrl: './editable-image.html',
  styleUrl: './editable-image.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.editing]': 'editMode.active()',
  },
})
export class EditableImageComponent {
  protected editMode = inject(EditModeService);
  private firebaseState = inject(FirebaseStateService);

  fieldId = input.required<string>();
  label = input.required<string>();
  imageUrl = input.required<string>();
  originalUrl = input('');
  // Where uploads go, under `images/`, e.g. `concepts/inner-gold`.
  storageFolder = input.required<string>();
  // Width / height of the crop frame, and the pixel size of the saved crop;
  // the two should agree.
  aspectRatio = input(3 / 2);
  cropSize = input<ImageSize>({ width: 1200, height: 800 });
  commit = input.required<(urls: ImageUrls) => Promise<SaveResult>>();

  protected isOpen = computed(() => this.editMode.openFieldId() === this.fieldId());
  protected canUndo = computed(() => this.editMode.canUndo(this.fieldId()));
  protected thumbSize = computed<ImageSize>(() => ({
    width: 240,
    height: Math.round(240 / this.aspectRatio()),
  }));
  protected uploadPrompt = computed(
    () => `Choose an image (${this.cropSize().width}×${this.cropSize().height} or larger)`,
  );

  protected saving = signal(false);
  protected errorMessage = signal<string | null>(null);

  protected open(event: MouseEvent) {
    if (!this.editMode.active() || this.isOpen()) return;
    event.preventDefault();
    this.errorMessage.set(null);
    this.editMode.openFieldId.set(this.fieldId());
  }

  protected close() {
    if (this.isOpen()) this.editMode.openFieldId.set(null);
  }

  protected async onCropped(event: { largeBlob: Blob; originalFile?: File }) {
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const app = this.firebaseState.app;
      const folder = this.storageFolder();
      const url = await uploadImage(app, event.largeBlob, folder, 'crop.png');
      // A re-crop of the existing image has no new original: keep the old one.
      const originalUrl = event.originalFile
        ? await uploadImage(app, event.originalFile, folder, event.originalFile.name)
        : this.originalUrl() || this.imageUrl();
      await this.apply({ url, originalUrl });
    } catch (error) {
      console.error('EditableImage: upload failed', error);
      this.errorMessage.set(`The upload failed: ${(error as Error).message ?? error}`);
    }
    this.saving.set(false);
  }

  protected async remove() {
    this.saving.set(true);
    this.errorMessage.set(null);
    await this.apply({ url: '', originalUrl: '' });
    this.saving.set(false);
  }

  protected async undo() {
    this.saving.set(true);
    this.errorMessage.set(null);
    const result = await this.editMode.undoTarget(this.fieldId());
    this.saving.set(false);
    if (!result.success) {
      this.errorMessage.set(result.message);
      return;
    }
    this.close();
  }

  // Writes the new URLs and records how to put the old ones back. The
  // uploaded files themselves are never deleted, which is what makes the undo
  // possible.
  private async apply(next: ImageUrls) {
    const previous: ImageUrls = { url: this.imageUrl(), originalUrl: this.originalUrl() };
    const commit = this.commit();
    const result = await commit(next);
    if (!result.success) {
      this.errorMessage.set(result.message);
      return;
    }
    this.editMode.record({
      targetId: this.fieldId(),
      label: this.label(),
      revert: () => commit(previous),
    });
    this.close();
  }
}
