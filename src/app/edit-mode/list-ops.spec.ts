import { describe, it, expect } from 'vitest';
import { insertAt, moveItem, removeAt, replaceAt } from './list-ops';

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
