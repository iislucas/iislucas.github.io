/* editable-list-item.ts
 *
 * <app-editable-list-item>: one entry of a list an admin can rearrange in
 * place while edit mode is on (profile links, favourite papers).
 *
 * Wrap each entry's content. Outside edit mode only that shows. In edit mode,
 * tapping an entry selects it, which brings up:
 *
 *   - a small toolbar at its top-right: move up, move down, delete,
 *   - a thin line with a + on its top and bottom edges, to add an entry
 *     above or below it.
 *
 * The component only reports what was asked for (`move`, `remove`, `insert`);
 * the page owns the list, writes it, and records the undo. Fields inside the
 * entry stay individually editable with <app-editable-field>, and tapping one
 * also selects its entry.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
} from '@angular/core';
import { EditModeService } from '../edit-mode.service';
import { IconComponent } from '../../icons/icon.component';

@Component({
  selector: 'app-editable-list-item',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './editable-list-item.html',
  styleUrl: './editable-list-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditableListItemComponent {
  protected editMode = inject(EditModeService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  // Unique on the page, e.g. `paper.2`.
  itemId = input.required<string>();
  // What an entry is called, for tooltips: 'paper', 'link'.
  label = input.required<string>();
  index = input.required<number>();
  count = input.required<number>();

  // -1 to move up, 1 to move down.
  move = output<number>();
  remove = output<void>();
  // The index a new entry should be inserted at: this entry's index to add
  // above it, one more to add below.
  insert = output<number>();

  protected isSelected = computed(
    () => this.editMode.active() && this.editMode.selectedItemId() === this.itemId(),
  );
  protected isFirst = computed(() => this.index() === 0);
  protected isLast = computed(() => this.index() === this.count() - 1);

  protected select() {
    if (!this.editMode.active()) return;
    this.editMode.selectedItemId.set(this.itemId());
  }

  // A tap anywhere outside the selected entry lets go of it.
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent) {
    if (!this.isSelected()) return;
    const target = event.target as Node | null;
    if (target && target.isConnected && !this.host.nativeElement.contains(target)) {
      this.editMode.selectedItemId.set(null);
    }
  }

  protected onMove(event: MouseEvent, delta: number) {
    event.stopPropagation();
    this.move.emit(delta);
  }

  protected onRemove(event: MouseEvent) {
    event.stopPropagation();
    this.editMode.selectedItemId.set(null);
    this.remove.emit();
  }

  protected onInsert(event: MouseEvent, below: boolean) {
    event.stopPropagation();
    this.insert.emit(below ? this.index() + 1 : this.index());
  }
}
