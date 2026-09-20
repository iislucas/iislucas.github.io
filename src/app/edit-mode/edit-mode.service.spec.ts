import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditModeService } from './edit-mode.service';
import {
  createFirebaseStateServiceMock,
  FirebaseStateService,
  SiteUser,
} from '../firebase-state.service';
import { RoutingService } from '../routing.service';
import { ROUTING_CONFIG, initPathPatterns } from '../app.config';
import { SaveResult } from '../content.service';

const OK: SaveResult = { success: true };

function adminUser(isAdmin: boolean): SiteUser {
  return {
    firebaseUser: {} as never as SiteUser['firebaseUser'],
    email: 'admin@example.com',
    displayName: 'Admin',
    photoURL: null,
    isAdmin,
  };
}

describe('EditModeService', () => {
  let service: EditModeService;
  let firebaseState: FirebaseStateService;

  beforeEach(() => {
    firebaseState = createFirebaseStateServiceMock();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: FirebaseStateService, useValue: firebaseState },
        // EditModeService mirrors edit mode into the URL, so it needs a router.
        RoutingService,
        { provide: ROUTING_CONFIG, useValue: { validPathPatterns: initPathPatterns } },
      ],
    });
    service = TestBed.inject(EditModeService);
  });

  it('is only ever active for an admin', () => {
    service.setActive(true);
    expect(service.active()).toBe(false);

    firebaseState.user.set(adminUser(false));
    expect(service.active()).toBe(false);

    firebaseState.user.set(adminUser(true));
    expect(service.active()).toBe(true);

    // Signing out turns it off, without anything else having to.
    firebaseState.user.set(null);
    expect(service.active()).toBe(false);
  });

  it('lets go of the open field and selected item when switched off', () => {
    firebaseState.user.set(adminUser(true));
    service.setActive(true);
    service.openFieldId.set('profile.name');
    service.selectedItemId.set('paper.1');
    service.setActive(false);
    expect(service.openFieldId()).toBeNull();
    expect(service.selectedItemId()).toBeNull();
  });

  it('undoes the most recent change first', async () => {
    const reverted: string[] = [];
    service.record({ targetId: 'a', label: 'A', revert: async () => (reverted.push('a'), OK) });
    service.record({ targetId: 'b', label: 'B', revert: async () => (reverted.push('b'), OK) });
    expect(service.lastChange()?.label).toBe('B');

    await service.undoLast();
    expect(reverted).toEqual(['b']);
    expect(service.lastChange()?.label).toBe('A');
  });

  it("undoes one target's latest change, leaving the others alone", async () => {
    const revertOldTitle = vi.fn(async () => OK);
    const revertNewTitle = vi.fn(async () => OK);
    service.record({ targetId: 'title', label: 'Title', revert: revertOldTitle });
    service.record({ targetId: 'title', label: 'Title', revert: revertNewTitle });
    service.record({ targetId: 'summary', label: 'Summary', revert: async () => OK });

    await service.undoTarget('title');
    expect(revertNewTitle).toHaveBeenCalledTimes(1);
    expect(revertOldTitle).not.toHaveBeenCalled();
    expect(service.canUndo('title')).toBe(true);
    expect(service.lastChange()?.label).toBe('Summary');
  });

  it('keeps an entry whose revert failed, so it can be tried again', async () => {
    service.record({
      targetId: 'a',
      label: 'A',
      revert: async () => ({ success: false, message: 'offline' }),
    });
    const result = await service.undoLast();
    expect(result.success).toBe(false);
    expect(service.undoError()).toBe('offline');
    expect(service.canUndo('a')).toBe(true);
  });

  it('reports that there is nothing to undo', async () => {
    expect(service.canUndo('anything')).toBe(false);
    expect((await service.undoTarget('anything')).success).toBe(false);
  });
});
