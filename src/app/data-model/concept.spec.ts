import { describe, it, expect } from 'vitest';
import {
  compareConcepts,
  Concept,
  conceptToFirestoreDoc,
  firestoreDocToConcept,
  initConcept,
  slugify,
} from './concept';
import { DocumentData, DocumentSnapshot } from 'firebase/firestore';

/** A stand-in for a Firestore snapshot: just the two things the reader uses. */
function fakeDoc(id: string, data: Record<string, unknown> | undefined) {
  return { id, data: () => data } as unknown as DocumentSnapshot<DocumentData>;
}

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Emotional Fixed Points')).toBe('emotional-fixed-points');
  });

  it('strips punctuation and collapses separators', () => {
    expect(slugify('Hierarchy, Heterarchy, and Homoarchy')).toBe(
      'hierarchy-heterarchy-and-homoarchy',
    );
  });

  it('strips accents rather than dropping the letter', () => {
    expect(slugify('Poincaré')).toBe('poincare');
  });

  it('never leaves a leading or trailing hyphen', () => {
    expect(slugify('  —Inner Gold!—  ')).toBe('inner-gold');
  });

  it('returns empty for input with nothing usable', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('firestoreDocToConcept', () => {
  it('takes the slug from the document id, not the body', () => {
    const concept = firestoreDocToConcept(fakeDoc('inner-gold', { title: 'Inner Gold' }));
    expect(concept.slug).toBe('inner-gold');
    expect(concept.title).toBe('Inner Gold');
  });

  it('fills defaults for a document missing every optional field', () => {
    const concept = firestoreDocToConcept(fakeDoc('bare', {}));
    expect(concept).toEqual({ ...initConcept('bare') });
  });

  it('survives a document with no data at all', () => {
    const concept = firestoreDocToConcept(fakeDoc('gone', undefined));
    expect(concept.slug).toBe('gone');
    expect(concept.published).toBe(false);
  });

  it('drops non-string entries from tags rather than passing them through', () => {
    const concept = firestoreDocToConcept(fakeDoc('x', { tags: ['ok', 3, null, 'fine'] }));
    expect(concept.tags).toEqual(['ok', 'fine']);
  });

  it('treats a non-boolean published value as unpublished', () => {
    expect(firestoreDocToConcept(fakeDoc('x', { published: 'yes' })).published).toBe(false);
    expect(firestoreDocToConcept(fakeDoc('x', { published: true })).published).toBe(true);
  });
});

describe('conceptToFirestoreDoc', () => {
  it('omits the slug, which is the document id', () => {
    const concept: Concept = { ...initConcept('inner-gold'), title: 'Inner Gold' };
    const doc = conceptToFirestoreDoc(concept);
    expect(doc['slug']).toBeUndefined();
    expect(doc['title']).toBe('Inner Gold');
  });

  it('round-trips through the reader unchanged', () => {
    const original: Concept = {
      ...initConcept('round-trip'),
      title: 'Round Trip',
      summary: 'A summary.',
      markdown: 'Body **text**.',
      acknowledgement: 'Thanks to someone.',
      tags: ['a', 'b'],
      order: 30,
      published: true,
      created: '2026-01-01T00:00:00.000Z',
      lastUpdated: '2026-02-02T00:00:00.000Z',
    };
    const restored = firestoreDocToConcept(
      fakeDoc('round-trip', conceptToFirestoreDoc(original) as Record<string, unknown>),
    );
    expect(restored).toEqual(original);
  });
});

describe('compareConcepts', () => {
  it('sorts by order first', () => {
    const a = { ...initConcept('a'), title: 'Zebra', order: 10 };
    const b = { ...initConcept('b'), title: 'Apple', order: 20 };
    expect([b, a].sort(compareConcepts).map((c) => c.slug)).toEqual(['a', 'b']);
  });

  it('breaks ties on order by title', () => {
    const a = { ...initConcept('a'), title: 'Zebra', order: 10 };
    const b = { ...initConcept('b'), title: 'Apple', order: 10 };
    expect([a, b].sort(compareConcepts).map((c) => c.slug)).toEqual(['b', 'a']);
  });
});
