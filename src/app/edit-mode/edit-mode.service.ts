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
 *
 * Whether edit mode is on is mirrored into the URL as `?edit=1`, on whichever
 * route is matched (see EDIT_URL_PARAM in app.config.ts). A reload therefore
 * comes back into edit mode rather than dropping out of it, which matters
 * because reloading mid-edit used to mean losing the mode and having to find
 * your place again.
 *
 * The switch below stays the source of truth and the URL follows it, rather
 * than the other way round: that keeps edit mode across in-app navigation,
 * where each route has its own copy of the parameter. The exception is a value
 * arriving from outside — the first matched route of a visit, a reload, or the
 * back button — which the switch adopts instead.
 */

import {
  computed,
  effect,
  inject,
  Injectable,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { FirebaseStateService } from '../firebase-state.service';
import { SaveResult } from '../content.service';
import { RoutingService } from '../routing.service';
import { AppPathPatterns, EDIT_URL_PARAM } from '../app.config';

// What the parameter reads when edit mode is on. Anything else counts as off,
// so a stray `?edit=yes` does not silently enable it.
const EDIT_ON = '1';

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
  private routing: RoutingService<AppPathPatterns> = inject(RoutingService);

  private switchedOn = signal(false);

  // Edit mode only ever applies to an admin: signing out, or losing admin
  // access, turns it off without anyone having to remember to. A URL carrying
  // ?edit=1 therefore does nothing for a visitor.
  public active = computed(() => this.switchedOn() && this.firebaseState.isAdmin());

  /**
   * The `edit` parameter of whichever route is matched, or null when the URL
   * matches none. The routing service types its signals per route, so reaching
   * the same parameter across all of them is necessarily dynamic.
   */
  private editParam = computed<WritableSignal<string> | null>(() => {
    const view = this.routing.matchedPatternId();
    if (!view) return null;
    const params = this.routing.signals[view].urlParams as unknown as Record<
      string,
      WritableSignal<string>
    >;
    return params[EDIT_URL_PARAM] ?? null;
  });

  // The last value this service put in the URL. A parameter that differs from
  // it changed somewhere else — the page was loaded or reloaded, or the back
  // button was pressed — and is adopted rather than overwritten.
  private lastWritten: string | null = null;

  constructor() {
    effect(() => {
      const param = this.editParam();
      if (!param) return;

      const inUrl = param();
      const wanted = this.switchedOn() ? EDIT_ON : '';

      if (inUrl !== this.lastWritten && inUrl !== wanted) {
        this.lastWritten = inUrl;
        untracked(() => this.setActive(inUrl === EDIT_ON));
        return;
      }

      this.lastWritten = wanted;
      if (inUrl !== wanted) untracked(() => param.set(wanted));
    });
  }

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
