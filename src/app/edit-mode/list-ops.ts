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
