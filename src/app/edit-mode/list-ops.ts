/* list-ops.ts
 *
 * Pure, copying operations on the lists edited in place (profile links,
 * favourite papers). Each returns a new array and never mutates its input, so
 * the array a change replaced can be kept as-is for undo.
 *
 * An out-of-range index leaves the list unchanged rather than throwing: these
 * are driven by taps on a list that may have changed underneath (another tab,
 * an undo), and a no-op is the safe reading of a stale tap.
 */

/** Moves the item at `index` by `delta` places (-1 is up, 1 is down). */
export function moveItem<T>(items: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (!inRange(items, index) || !inRange(items, target)) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Moves the item at `from` to sit at position `to`, shifting the rest along.
 *
 * Unlike `moveItem`, which swaps two neighbours, this is what a drag and drop
 * means: the dragged item is taken out and put back somewhere else, and
 * everything between shuffles up or down by one. `to` is read as a position in
 * the list once the item has been removed, so dropping onto the last slot is
 * `items.length - 1`.
 */
export function moveTo<T>(items: readonly T[], from: number, to: number): T[] {
  if (!inRange(items, from) || !inRange(items, to) || from === to) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Where an item dragged from `from` ends up when dropped on slot `slot`.
 *
 * Slots sit *between* items: slot n is the gap before item n, and a list of k
 * items has k+1 of them. Dropping onto a slot past the item's own position
 * therefore lands one place too far once the item has been lifted out, so
 * those are pulled back by one.
 *
 * Returns null when the drop would not move anything — the two slots either
 * side of an item both mean "leave it where it is".
 */
export function positionForDropSlot(from: number, slot: number): number | null {
  const to = slot > from ? slot - 1 : slot;
  return to === from ? null : to;
}

/** Inserts `item` so that it ends up at `index` (0..length inclusive). */
export function insertAt<T>(items: readonly T[], index: number, item: T): T[] {
  if (index < 0 || index > items.length) return [...items];
  return [...items.slice(0, index), item, ...items.slice(index)];
}

export function removeAt<T>(items: readonly T[], index: number): T[] {
  if (!inRange(items, index)) return [...items];
  return items.filter((_, i) => i !== index);
}

export function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
  if (!inRange(items, index)) return [...items];
  return items.map((existing, i) => (i === index ? item : existing));
}

function inRange<T>(items: readonly T[], index: number): boolean {
  return index >= 0 && index < items.length;
}
