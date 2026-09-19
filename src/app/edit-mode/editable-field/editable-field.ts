/* editable-field.ts
 *
 * <app-editable-field>: one piece of page content that an admin can change in
 * place while edit mode is on.
 *
 * Wrap the content as it is normally displayed:
 *
 *   <h1>
 *     <app-editable-field fieldId="concept.title" label="Title"
 *         [value]="concept.title" [commit]="saveTitle">
 *       {{ concept.title }}
 *     </app-editable-field>
 *   </h1>
 *
 * Outside edit mode it renders only the projected content, and takes no space
 * of its own. In edit mode the content gets a subtle outline; tapping it
 * swaps in an editor (a line, a few lines, or the markdown editor, per `kind`)
 * with three controls:
 *
 *   ✓ accept — writes the new value through `commit`,
 *   ✕ cancel — closes the editor, changing nothing,
 *   ↶ undo   — puts back this field's value from before its last accepted
 *              change (history lives in EditModeService, for the session).
 *
 * Enter accepts a one-line field (Ctrl/⌘+Enter for multi-line) and Escape
 * cancels.
 */

import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  afterRenderEffect,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { EditModeService } from '../edit-mode.service';
import { SaveResult } from '../../content.service';
import { IconComponent } from '../../icons/icon.component';
import { MarkdownEditor } from '../../markdown-editor/markdown-editor';
import { SpinnerComponent } from '../../spinner/spinner.component';

export enum EditKind {
  // A single line of text.
  Text = 'text',
  // Plain text over a few lines; `rows` sets how many are shown.
  MultilineText = 'multiline',
  // Markdown, edited with <app-markdown-editor>.
  Markdown = 'markdown',
}

// What <app-markdown-editor> calls to upload a pasted or picked image; returns
// the image's URL.
export type MarkdownImageUploader = (blob: Blob, meta: { originalFile?: File }) => Promise<string>;

@Component({
  selector: 'app-editable-field',
  standalone: true,
  imports: [IconComponent, MarkdownEditor, SpinnerComponent],
  templateUrl: './editable-field.html',
  styleUrl: './editable-field.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.inline]': 'inline()',
    '[class.editing]': 'editMode.active()',
    '[class.open]': 'isOpen()',
  },
})
export class EditableFieldComponent {
  protected editMode = inject(EditModeService);

  // Unique on the page: which field is open, and whose undo history is whose.
  fieldId = input.required<string>();
  // Names the field in tooltips and on the banner's undo button.
  label = input.required<string>();
  // The stored value, which the editor starts from.
  value = input.required<string>();
  // Writes a new value. Also used by undo, to write the previous one back.
  commit = input.required<(value: string) => Promise<SaveResult>>();
  kind = input<EditKind>(EditKind.Text);
  placeholder = input('');
  rows = input(2);
  // Shown in edit mode in place of an empty value, so there is something to
  // tap. Defaults to "Add <label>".
  emptyText = input('');
  // Sits in a line of text (e.g. a year beside a title) rather than a block.
  inline = input(false, { transform: booleanAttribute });
  imageUploader = input<MarkdownImageUploader | null>(null);

  protected EditKind = EditKind;
  protected isOpen = computed(() => this.editMode.openFieldId() === this.fieldId());
  protected isEmpty = computed(() => this.value().trim() === '');
  protected canUndo = computed(() => this.editMode.canUndo(this.fieldId()));
  protected shownEmptyText = computed(
    () => this.emptyText() || `Add ${this.label().toLowerCase()}`,
  );

  // Re-seeded from the stored value each time the editor opens, and read
  // untracked so that a snapshot arriving mid-edit does not wipe the draft.
  protected draft = linkedSignal({
    source: this.isOpen,
    computation: () => untracked(this.value),
  });
  // The markdown editor's starting document. Kept apart from `draft`: feeding
  // every keystroke back into `initialValue` would fight the cursor.
  protected markdownSeed = linkedSignal({
    source: this.isOpen,
    computation: () => untracked(this.value),
  });

  protected saving = signal(false);
  protected errorMessage = signal<string | null>(null);

  private textInput = viewChild<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('textInput');

  constructor() {
    // Focus the input as soon as it is in the page, so tapping a field is
    // enough to start typing.
    afterRenderEffect(() => {
      const input = this.textInput();
      if (!input) return;
      input.nativeElement.focus();
      untracked(() => {
        if (this.editMode.selectAllOnOpen()) {
          input.nativeElement.select();
          this.editMode.selectAllOnOpen.set(false);
        }
      });
    });
  }

  /**
   * A tap on the displayed content opens the editor. The default is
   * prevented so that tapping a linked title edits it rather than following
   * the link; the event still bubbles, so an enclosing list item is selected.
   */
  protected onDisplayClick(event: MouseEvent) {
    if (!this.editMode.active() || this.isOpen()) return;
    event.preventDefault();
    this.errorMessage.set(null);
    this.editMode.openFieldId.set(this.fieldId());
  }

  protected onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
      return;
    }
    const multiline = this.kind() === EditKind.MultilineText;
    if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.accept();
    }
  }

  protected async accept() {
    const kind = this.kind();
    const next = kind === EditKind.Markdown ? this.draft() : this.draft().trim();
    const previous = this.value();
    if (next === previous) {
      this.close();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    const commit = this.commit();
    const result = await commit(next);
    this.saving.set(false);
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

  protected cancel() {
    this.errorMessage.set(null);
    this.close();
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

  private close() {
    if (this.isOpen()) this.editMode.openFieldId.set(null);
  }
}
