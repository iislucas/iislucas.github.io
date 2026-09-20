/* editable-link-chip.ts
 *
 * <app-editable-link-chip>: one labelled link, shown as a chip, edited in
 * place while edit mode is on.
 *
 * Outside edit mode it is a plain <a> and nothing else. In edit mode the chip
 * keeps its size and its place in the row — the row does not become a column,
 * because rearranging links should not mean the page rearranging itself around
 * you — and gains a dashed outline and a drag handle. Tapping it opens a small
 * popover holding both halves of a link at once, its text and its URL, since
 * editing one without seeing the other is how a label ends up describing the
 * wrong page.
 *
 * The component reports what was asked for (`save`, `remove`, `moveTo`); the
 * page owns the list, writes it, and records the undo.
 *
 * Dragging uses the HTML drag-and-drop API, which is a mouse affair: touch
 * devices do not fire it. Reordering is therefore a desktop gesture, which
 * suits a control that only the site's editor ever sees.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { EditModeService } from '../edit-mode.service';
import { IconComponent } from '../../icons/icon.component';
import { ProfileLink } from '../../data-model/profile';

// Identifies the dragged chip's index in the drag payload. The API insists on
// a MIME-ish key; this one is ours and is never read by anything else.
export const LINK_DRAG_TYPE = 'application/x-link-index';

@Component({
  selector: 'app-editable-link-chip',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './editable-link-chip.html',
  styleUrl: './editable-link-chip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditableLinkChipComponent {
  protected editMode = inject(EditModeService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  link = input.required<ProfileLink>();
  index = input.required<number>();

  save = output<ProfileLink>();
  remove = output<void>();
  /** Where this chip was dropped: the index it should end up at. */
  moveTo = output<number>();

  private labelInput = viewChild<ElementRef<HTMLInputElement>>('labelInput');

  // One popover open at a time across the whole page, which is what
  // EditModeService's openFieldId already arbitrates.
  protected fieldId = computed(() => `profile.link.${this.index()}`);
  protected isOpen = computed(
    () => this.editMode.active() && this.editMode.openFieldId() === this.fieldId(),
  );

  protected draftLabel = signal('');
  protected draftUrl = signal('');

  // The chip only becomes draggable while the pointer is down on its handle,
  // so that a drag cannot be started by grabbing the chip's text.
  protected dragArmed = signal(false);
  protected isDragging = signal(false);

  protected shownText = computed(() => this.link().label || this.link().url || 'New link');

  constructor() {
    // Seed the draft each time the popover opens, so cancelling and reopening
    // shows what is stored rather than the abandoned edit.
    effect(() => {
      if (!this.isOpen()) return;
      const link = this.link();
      this.draftLabel.set(link.label);
      this.draftUrl.set(link.url);
      setTimeout(() => this.labelInput()?.nativeElement.focus(), 0);
    });
  }

  protected open(event: Event) {
    if (!this.editMode.active()) return;
    event.preventDefault();
    event.stopPropagation();
    this.editMode.openFieldId.set(this.fieldId());
  }

  protected close() {
    if (this.isOpen()) this.editMode.openFieldId.set(null);
  }

  protected accept() {
    this.save.emit({ label: this.draftLabel().trim(), url: this.draftUrl().trim() });
    this.close();
  }

  protected onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.accept();
    }
  }

  // A click anywhere else closes the popover, the way the rest of edit mode
  // behaves. Clicks inside it are left alone.
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent) {
    if (!this.isOpen()) return;
    const target = event.target as Node | null;
    if (target && this.host.nativeElement.contains(target)) return;
    this.close();
  }

  protected armDrag() {
    this.dragArmed.set(true);
  }

  protected onDragStart(event: DragEvent) {
    if (!this.dragArmed()) {
      event.preventDefault();
      return;
    }
    this.isDragging.set(true);
    event.dataTransfer?.setData(LINK_DRAG_TYPE, String(this.index()));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  protected onDragEnd() {
    this.dragArmed.set(false);
    this.isDragging.set(false);
  }
}
