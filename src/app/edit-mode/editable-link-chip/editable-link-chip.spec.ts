/* editable-link-chip.spec.ts
 *
 * The chip's two jobs: being an ordinary link when nobody is editing, and
 * being an editor for both halves of a link at once when someone is.
 */

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditableLinkChipComponent, LINK_DRAG_TYPE } from './editable-link-chip';
import { EditModeService } from '../edit-mode.service';
import {
  createFirebaseStateServiceMock,
  FirebaseStateService,
  SiteUser,
} from '../../firebase-state.service';
import { RoutingService } from '../../routing.service';
import { ROUTING_CONFIG, initPathPatterns } from '../../app.config';
import { ProfileLink } from '../../data-model/profile';

const LINK: ProfileLink = { label: 'PAIR', url: 'https://pair.withgoogle.com' };

function adminUser(): SiteUser {
  return {
    firebaseUser: {} as never as SiteUser['firebaseUser'],
    email: 'admin@example.test',
    displayName: 'Admin',
    photoURL: null,
    isAdmin: true,
  };
}

describe('EditableLinkChipComponent', () => {
  let fixture: ComponentFixture<EditableLinkChipComponent>;
  let editMode: EditModeService;
  let firebaseState: FirebaseStateService;

  beforeEach(async () => {
    window.history.replaceState(null, '', '/');
    TestBed.resetTestingModule();
    firebaseState = createFirebaseStateServiceMock();

    await TestBed.configureTestingModule({
      imports: [EditableLinkChipComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: FirebaseStateService, useValue: firebaseState },
        RoutingService,
        { provide: ROUTING_CONFIG, useValue: { validPathPatterns: initPathPatterns } },
      ],
    }).compileComponents();

    editMode = TestBed.inject(EditModeService);
    fixture = TestBed.createComponent(EditableLinkChipComponent);
    fixture.componentRef.setInput('link', LINK);
    fixture.componentRef.setInput('index', 1);
    await fixture.whenStable();
  });

  async function enterEditMode() {
    firebaseState.user.set(adminUser());
    editMode.setActive(true);
    await fixture.whenStable();
  }

  function el<T extends Element>(selector: string): T | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function popoverInputs(): HTMLInputElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.link-popover input'));
  }

  it('is an ordinary link when nobody is editing', () => {
    const anchor = el<HTMLAnchorElement>('a.chip-link');

    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute('href')).toBe(LINK.url);
    expect(anchor!.getAttribute('target')).toBe('_blank');
    expect(anchor!.textContent).toContain('PAIR');
    // Nothing editable is offered to a reader.
    expect(el('.drag-handle')).toBeNull();
  });

  it('becomes a draggable, tappable chip in edit mode, and stays in the row', async () => {
    await enterEditMode();

    expect(el('a.chip-link')).toBeNull();
    expect(el('.chip-editable')).not.toBeNull();
    expect(el('.drag-handle')).not.toBeNull();
    // Still a chip, not a stacked label-and-URL block.
    expect(el('.chip-text')!.textContent?.trim()).toBe('PAIR');
  });

  it('opens a popover holding both the text and the URL', async () => {
    await enterEditMode();
    el<HTMLElement>('.chip-editable')!.click();
    await fixture.whenStable();

    const inputs = popoverInputs();
    expect(inputs).toHaveLength(2);
    expect(inputs[0].value).toBe('PAIR');
    expect(inputs[1].value).toBe('https://pair.withgoogle.com');
  });

  it('saves both halves together', async () => {
    const saved = vi.fn();
    fixture.componentInstance.save.subscribe(saved);
    await enterEditMode();
    el<HTMLElement>('.chip-editable')!.click();
    await fixture.whenStable();

    const [label, url] = popoverInputs();
    label.value = '  Jigsaw  ';
    label.dispatchEvent(new Event('input'));
    url.value = ' https://jigsaw.google.com ';
    url.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const save = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('.link-popover-actions button'),
    ).find((b) => b.textContent?.includes('Save'))!;
    save.click();
    await fixture.whenStable();

    expect(saved).toHaveBeenCalledWith({ label: 'Jigsaw', url: 'https://jigsaw.google.com' });
  });

  it('abandons an edit on cancel, and shows the stored values again on reopen', async () => {
    const saved = vi.fn();
    fixture.componentInstance.save.subscribe(saved);
    await enterEditMode();
    el<HTMLElement>('.chip-editable')!.click();
    await fixture.whenStable();

    const [label] = popoverInputs();
    label.value = 'abandoned';
    label.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const cancel = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('.link-popover-actions button'),
    ).find((b) => b.textContent?.includes('Cancel'))!;
    cancel.click();
    await fixture.whenStable();
    expect(saved).not.toHaveBeenCalled();

    el<HTMLElement>('.chip-editable')!.click();
    await fixture.whenStable();
    expect(popoverInputs()[0].value).toBe('PAIR');
  });

  it('only one popover is open at a time, since edit mode arbitrates', async () => {
    await enterEditMode();
    el<HTMLElement>('.chip-editable')!.click();
    await fixture.whenStable();
    expect(el('.link-popover')).not.toBeNull();

    // Another field elsewhere on the page opening closes this one.
    editMode.openFieldId.set('something.else');
    await fixture.whenStable();

    expect(el('.link-popover')).toBeNull();
  });

  it('only drags once the grip has been taken', async () => {
    await enterEditMode();
    const chip = el<HTMLElement>('.chip-editable')!;

    // Grabbing the chip itself must not start a drag: that is how text gets
    // dragged out of a control by accident.
    expect(chip.getAttribute('draggable')).toBe('false');

    el<HTMLElement>('.drag-handle')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await fixture.whenStable();

    expect(chip.getAttribute('draggable')).toBe('true');
  });

  it('carries its own index in the drag payload', async () => {
    await enterEditMode();
    el<HTMLElement>('.drag-handle')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await fixture.whenStable();

    const carried = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => carried.set(type, value),
      effectAllowed: '',
    };
    const dragStart = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(dragStart, 'dataTransfer', { value: dataTransfer });
    el<HTMLElement>('.chip-editable')!.dispatchEvent(dragStart);

    expect(carried.get(LINK_DRAG_TYPE)).toBe('1');
  });
});
