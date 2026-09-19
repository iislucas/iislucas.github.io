import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditableFieldComponent, EditKind } from './editable-field';
import { EditModeService } from '../edit-mode.service';
import {
  createFirebaseStateServiceMock,
  FirebaseStateService,
  SiteUser,
} from '../../firebase-state.service';
import { SaveResult } from '../../content.service';

describe('EditableFieldComponent', () => {
  let fixture: ComponentFixture<EditableFieldComponent>;
  let editMode: EditModeService;
  let commit: ReturnType<typeof vi.fn<(value: string) => Promise<SaveResult>>>;
  let host: HTMLElement;

  beforeEach(async () => {
    const firebaseState = createFirebaseStateServiceMock();
    firebaseState.user.set({ isAdmin: true, email: 'a@example.com' } as never as SiteUser);
    await TestBed.configureTestingModule({
      imports: [EditableFieldComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: FirebaseStateService, useValue: firebaseState },
      ],
    }).compileComponents();

    editMode = TestBed.inject(EditModeService);
    commit = vi.fn(async () => ({ success: true }) as SaveResult);
    fixture = TestBed.createComponent(EditableFieldComponent);
    fixture.componentRef.setInput('fieldId', 'concept.title');
    fixture.componentRef.setInput('label', 'Title');
    fixture.componentRef.setInput('value', 'Inner Gold');
    fixture.componentRef.setInput('commit', commit);
    host = fixture.nativeElement;
    await fixture.whenStable();
  });

  function display(): HTMLElement {
    return host.querySelector('.editable-display') as HTMLElement;
  }

  function input(): HTMLInputElement | HTMLTextAreaElement | null {
    return host.querySelector('.edit-input');
  }

  async function open() {
    editMode.setActive(true);
    await fixture.whenStable();
    display().click();
    await fixture.whenStable();
  }

  function type(value: string) {
    const el = input()!;
    el.value = value;
    el.dispatchEvent(new Event('input'));
  }

  function button(title: string): HTMLButtonElement {
    return host.querySelector(`button[title="${title}"]`) as HTMLButtonElement;
  }

  it('is inert outside edit mode: a tap opens nothing', async () => {
    display().click();
    await fixture.whenStable();
    expect(display().classList).not.toContain('enabled');
    expect(input()).toBeNull();
  });

  it('opens an editor seeded with the stored value when tapped in edit mode', async () => {
    await open();
    expect(input()?.value).toBe('Inner Gold');
    expect(editMode.openFieldId()).toBe('concept.title');
  });

  it('accepts: writes the trimmed value, closes, and records an undo', async () => {
    await open();
    type('  Outer Gold  ');
    button('Accept').click();
    await fixture.whenStable();
    expect(commit).toHaveBeenCalledWith('Outer Gold');
    expect(input()).toBeNull();
    expect(editMode.canUndo('concept.title')).toBe(true);
  });

  it('cancels without writing anything', async () => {
    await open();
    type('Something else');
    button('Cancel').click();
    await fixture.whenStable();
    expect(commit).not.toHaveBeenCalled();
    expect(input()).toBeNull();
  });

  it('accepts on Enter and cancels on Escape', async () => {
    await open();
    type('Via keyboard');
    input()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(commit).toHaveBeenCalledWith('Via keyboard');

    await open();
    input()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(input()).toBeNull();
  });

  it('writes nothing when the value is unchanged', async () => {
    await open();
    button('Accept').click();
    await fixture.whenStable();
    expect(commit).not.toHaveBeenCalled();
  });

  it('undo writes back the value from before the last accepted change', async () => {
    await open();
    type('Outer Gold');
    button('Accept').click();
    await fixture.whenStable();

    await open();
    button('Undo the last saved change').click();
    await fixture.whenStable();
    expect(commit).toHaveBeenLastCalledWith('Inner Gold');
    expect(editMode.canUndo('concept.title')).toBe(false);
  });

  it('keeps the editor open and shows why when the write fails', async () => {
    commit.mockResolvedValueOnce({ success: false, message: 'Firestore refused the write' });
    await open();
    type('Outer Gold');
    button('Accept').click();
    await fixture.whenStable();
    expect(input()).not.toBeNull();
    expect(host.querySelector('.inline-error')?.textContent).toContain('Firestore refused');
    expect(editMode.canUndo('concept.title')).toBe(false);
  });

  it('shows something to tap in place of an empty value', async () => {
    fixture.componentRef.setInput('value', '');
    editMode.setActive(true);
    await fixture.whenStable();
    expect(host.querySelector('.empty-text')?.textContent).toContain('Add title');
  });

  it('edits several lines in a textarea', async () => {
    fixture.componentRef.setInput('kind', EditKind.MultilineText);
    fixture.componentRef.setInput('rows', 2);
    await open();
    expect(input()?.tagName).toBe('TEXTAREA');
    expect((input() as HTMLTextAreaElement).rows).toBe(2);
  });

  it('stops a tap on a link inside it from following the link', async () => {
    editMode.setActive(true);
    await fixture.whenStable();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    display().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
