/* edit-mode.service.ts
 *
 * The site-wide "edit mode" an admin switches into to change content in
 * place, rather than on separate edit pages.
 *
 * While it is on, every editable piece of a page (see <app-editable-field>,
 * <app-editable-image> and <app-editable-list-item>) can be tapped:
 *
 *   - a field opens a small inline editor with accept / cancel / undo,
 *   - a list item becomes "selected", which shows its move / delete controls
 *     and the lines for adding an entry above or below it.
 *
 * At most one field is open and one list item selected at a time; both are
 * tracked here so that opening one closes the other, wherever it is on the page.
 *
 * Every accepted change is written straight to Firestore, so the service also
 * keeps an undo history for the session: each entry knows how to put back what
 * it replaced. A field's undo button takes back that field's latest change;
 * the edit-mode banner takes back the latest change of any kind.
 */

import { computed, inject, Injectable, signal } from '@angular/core';
import { FirebaseStateService } from '../firebase-state.service';
import { SaveResult } from '../content.service';

export interface UndoEntry {
  // Identifies what changed, so a field can find its own entries; list-level
  // changes use the list's id.
  targetId: string;
  // Shown on the banner's undo button, e.g. 'Summary' or 'delete paper'.
  label: string;
  // Puts back the value this change replaced.
  revert: () => Promise<SaveResult>;
}

@Injectable({ providedIn: 'root' })
export class EditModeService {
  private firebaseState = inject(FirebaseStateService);

  private switchedOn = signal(false);

  // Edit mode only ever applies to an admin: signing out, or losing admin
  // access, turns it off without anyone having to remember to.
  public active = computed(() => this.switchedOn() && this.firebaseState.isAdmin());

  // The field whose inline editor is open, or null.
  public openFieldId = signal<string | null>(null);
  // The list item currently selected, or null.
  public selectedItemId = signal<string | null>(null);
  // Set just before opening the field of an entry that was only just added:
  // its text is then selected, so that typing replaces the placeholder.
  public selectAllOnOpen = signal(false);

  private history = signal<UndoEntry[]>([]);
  public lastChange = computed(() => this.history().at(-1) ?? null);
  public undoing = signal(false);
  public undoError = signal<string | null>(null);

  public setActive(on: boolean) {
    this.switchedOn.set(on);
    if (!on) this.clearSelection();
  }

  public toggle() {
    this.setActive(!this.switchedOn());
  }

  public clearSelection() {
    this.openFieldId.set(null);
    this.selectedItemId.set(null);
  }

  public record(entry: UndoEntry) {
    this.history.update((entries) => [...entries, entry]);
  }

  public canUndo(targetId: string): boolean {
    return this.history().some((e) => e.targetId === targetId);
  }

  /** Takes back the most recent change to `targetId`. */
  public undoTarget(targetId: string): Promise<SaveResult> {
    const entries = this.history();
    let index = entries.length - 1;
    while (index >= 0 && entries[index].targetId !== targetId) index--;
    return this.undoAt(index);
  }

  /** Takes back the most recent change of any kind. */
  public undoLast(): Promise<SaveResult> {
    return this.undoAt(this.history().length - 1);
  }

  // The entry is only dropped once its revert has been written: a failed undo
  // leaves it in place, so it can be tried again.
  private async undoAt(index: number): Promise<SaveResult> {
    const entry = this.history()[index];
    if (!entry) return { success: false, message: 'There is nothing to undo.' };
    this.undoing.set(true);
    this.undoError.set(null);
    const result = await entry.revert();
    this.undoing.set(false);
    if (!result.success) {
      this.undoError.set(result.message);
      return result;
    }
    this.history.update((entries) => entries.filter((e) => e !== entry));
    return result;
  }
}
