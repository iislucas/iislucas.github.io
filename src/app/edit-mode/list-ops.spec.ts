import { describe, it, expect } from 'vitest';
import { insertAt, moveItem, moveTo, positionForDropSlot, removeAt, replaceAt } from './list-ops';

describe('moveItem', () => {
  it('moves an item up and down', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('does nothing past either end', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });

  it('never mutates its input', () => {
    const items = ['a', 'b'];
    moveItem(items, 0, 1);
    expect(items).toEqual(['a', 'b']);
  });
});

describe('insertAt', () => {
  it('inserts above, below and at the end', () => {
    expect(insertAt(['a', 'b'], 0, 'x')).toEqual(['x', 'a', 'b']);
    expect(insertAt(['a', 'b'], 1, 'x')).toEqual(['a', 'x', 'b']);
    expect(insertAt(['a', 'b'], 2, 'x')).toEqual(['a', 'b', 'x']);
  });

  it('inserts into an empty list', () => {
    expect(insertAt([], 0, 'x')).toEqual(['x']);
  });

  it('ignores an index out of range', () => {
    expect(insertAt(['a'], 5, 'x')).toEqual(['a']);
  });
});

describe('removeAt / replaceAt', () => {
  it('removes the item at an index', () => {
    expect(removeAt(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
  });

  it('replaces the item at an index', () => {
    expect(replaceAt(['a', 'b'], 1, 'x')).toEqual(['a', 'x']);
  });

  it('leaves the list alone for a stale index', () => {
    expect(removeAt(['a'], 3)).toEqual(['a']);
    expect(replaceAt(['a'], -1, 'x')).toEqual(['a']);
  });
});

describe('moveTo', () => {
  const items = ['a', 'b', 'c', 'd'];

  it('takes an item out and puts it back further along', () => {
    expect(moveTo(items, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('takes an item out and puts it back earlier', () => {
    expect(moveTo(items, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('shifts everything between by one, rather than swapping a pair', () => {
    // The difference from moveItem, which would give ['d', 'b', 'c', 'a'].
    expect(moveTo(items, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('leaves the list alone for a no-op or an out-of-range move', () => {
    expect(moveTo(items, 1, 1)).toEqual(items);
    expect(moveTo(items, -1, 2)).toEqual(items);
    expect(moveTo(items, 1, 9)).toEqual(items);
  });

  it('never mutates its input', () => {
    const original = [...items];
    moveTo(items, 0, 3);
    expect(items).toEqual(original);
  });
});

describe('positionForDropSlot', () => {
  // Slots sit between items: for [a, b, c, d] the slots are
  //   0 a 1 b 2 c 3 d 4
  it("drops before an earlier item at that item's index", () => {
    expect(positionForDropSlot(3, 1)).toBe(1);
    expect(positionForDropSlot(2, 0)).toBe(0);
  });

  it('pulls a later drop back by one, for the gap the item leaves behind', () => {
    // Dragging `a` (0) onto the slot after `c` (3) should land it third,
    // at index 2 -- not 3, which would put it after `d`.
    expect(positionForDropSlot(0, 3)).toBe(2);
    expect(positionForDropSlot(0, 4)).toBe(3);
  });

  it('treats the slots either side of an item as no move at all', () => {
    expect(positionForDropSlot(2, 2)).toBeNull();
    expect(positionForDropSlot(2, 3)).toBeNull();
  });

  it('round-trips against moveTo for every slot in a small list', () => {
    const items = ['a', 'b', 'c', 'd'];
    // Dropping each item on each slot either leaves the list alone or moves
    // exactly that item, never loses or duplicates one.
    for (let from = 0; from < items.length; from++) {
      for (let slot = 0; slot <= items.length; slot++) {
        const to = positionForDropSlot(from, slot);
        const result = to === null ? [...items] : moveTo(items, from, to);
        expect(result).toHaveLength(items.length);
        expect([...result].sort()).toEqual([...items].sort());
      }
    }
  });
});
