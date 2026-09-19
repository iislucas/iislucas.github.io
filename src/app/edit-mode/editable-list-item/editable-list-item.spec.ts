import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { describe, it, expect, beforeEach } from 'vitest';
import { EditableListItemComponent } from './editable-list-item';
import { EditModeService } from '../edit-mode.service';
import {
  createFirebaseStateServiceMock,
  FirebaseStateService,
  SiteUser,
} from '../../firebase-state.service';

describe('EditableListItemComponent', () => {
  let fixture: ComponentFixture<EditableListItemComponent>;
  let editMode: EditModeService;
  let host: HTMLElement;
  const emitted: { move: number[]; remove: number; insert: number[] } = {
    move: [],
    remove: 0,
    insert: [],
  };

  beforeEach(async () => {
    const firebaseState = createFirebaseStateServiceMock();
    firebaseState.user.set({ isAdmin: true, email: 'a@example.com' } as never as SiteUser);
    await TestBed.configureTestingModule({
      imports: [EditableListItemComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: FirebaseStateService, useValue: firebaseState },
      ],
    }).compileComponents();

    editMode = TestBed.inject(EditModeService);
    fixture = TestBed.createComponent(EditableListItemComponent);
    fixture.componentRef.setInput('itemId', 'paper.1');
    fixture.componentRef.setInput('label', 'paper');
    fixture.componentRef.setInput('index', 1);
    fixture.componentRef.setInput('count', 3);
    emitted.move = [];
    emitted.remove = 0;
    emitted.insert = [];
    fixture.componentInstance.move.subscribe((d) => emitted.move.push(d));
    fixture.componentInstance.remove.subscribe(() => emitted.remove++);
    fixture.componentInstance.insert.subscribe((i) => emitted.insert.push(i));
    host = fixture.nativeElement;
    await fixture.whenStable();
  });

  function item(): HTMLElement {
    return host.querySelector('.list-item') as HTMLElement;
  }

  function button(title: string): HTMLButtonElement {
    return host.querySelector(`button[title="${title}"]`) as HTMLButtonElement;
  }

  async function select() {
    editMode.setActive(true);
    await fixture.whenStable();
    item().click();
    await fixture.whenStable();
  }

  it('cannot be selected outside edit mode', async () => {
    item().click();
    await fixture.whenStable();
    expect(editMode.selectedItemId()).toBeNull();
    expect(host.querySelector('.item-toolbar')).toBeNull();
  });

  it('shows its toolbar and add lines once selected', async () => {
    await select();
    expect(item().classList).toContain('selected');
    expect(button('Add a paper above')).not.toBeNull();
    expect(button('Add a paper below')).not.toBeNull();
  });

  it('reports moves, deletes and inserts above and below', async () => {
    await select();
    button('Move paper up').click();
    button('Move paper down').click();
    button('Add a paper above').click();
    button('Add a paper below').click();
    expect(emitted.move).toEqual([-1, 1]);
    expect(emitted.insert).toEqual([1, 2]);

    button('Delete paper').click();
    expect(emitted.remove).toBe(1);
    expect(editMode.selectedItemId()).toBeNull();
  });

  it('cannot move the first entry up or the last one down', async () => {
    fixture.componentRef.setInput('index', 0);
    await select();
    expect(button('Move paper up').disabled).toBe(true);
    expect(button('Move paper down').disabled).toBe(false);

    fixture.componentRef.setInput('index', 2);
    await fixture.whenStable();
    expect(button('Move paper down').disabled).toBe(true);
  });

  it('lets go of the selection on a tap elsewhere', async () => {
    await select();
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.click();
    await fixture.whenStable();
    expect(editMode.selectedItemId()).toBeNull();
    outside.remove();
  });
});
