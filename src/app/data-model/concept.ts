/* concept.ts
 *
 * The data model for a Concept Gallery entry, and its Firestore conversions.
 *
 * A Concept is a short, self-contained idea: a name, a one-line gloss, and a
 * markdown body that can go as deep as it needs to. Concepts are public to
 * read (see firestore.rules) and only writable by an admin, so every field
 * here is safe to ship to an anonymous visitor.
 *
 * Firestore documents are keyed by `slug`, not by a random id: the slug is the
 * URL (`/concepts/<slug>`), so making it the document id means a concept can be
 * fetched by URL with a single `getDoc` and no query or index.
 */

import { DocumentData, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase/firestore';

export interface Concept {
  // URL-safe id; also the Firestore document id. e.g. 'interpretability-illusions'.
  slug: string;
  // Display name of the concept.
  title: string;
  // One-line gloss, shown on gallery cards and in link previews.
  summary: string;
  // The body of the concept, as markdown (edited with <app-markdown-editor>).
  markdown: string;
  // The "(Thanks to ...)" credit that closes almost every concept: who the idea
  // was explored with, or whose writing it came from. Its own field rather than
  // a trailing line of `markdown`, so it renders consistently and can never be
  // lost in the middle of an edit.
  acknowledgement: string;
  // Free-form tags, used for filtering the gallery.
  tags: string[];
  // Optional hero image, shown on the card and at the top of the concept page.
  // This is the cropped version; `imageOriginalUrl` is the uncropped upload it
  // was cut from, kept so that the crop can be redone later.
  imageUrl: string;
  imageOriginalUrl: string;
  // Sort key for the gallery: lower sorts first, ties broken by title. Kept as
  // an explicit number so the order can be curated rather than chronological.
  order: number;
  // Drafts are visible to an admin only; the rules enforce this, they are not
  // merely hidden in the UI.
  published: boolean;
  // ISO-8601 timestamps, written by the client on save.
  created: string;
  lastUpdated: string;
}

export function initConcept(slug = ''): Concept {
  return {
    slug,
    title: '',
    summary: '',
    markdown: '',
    acknowledgement: '',
    tags: [],
    imageUrl: '',
    imageOriginalUrl: '',
    order: 0,
    published: false,
    created: '',
    lastUpdated: '',
  };
}

/**
 * Builds a URL-safe slug from a title. Lowercases, strips anything that is not
 * a letter, digit or space, and joins words with '-'. Returns '' for input with
 * no usable characters, which callers treat as "ask the user for a slug".
 */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFD')
      // Strip combining accents, so "Pointé" and "Pointe" slug the same.
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
  );
}

/**
 * Reads a Firestore document into a Concept, filling in defaults for anything
 * missing. Documents written by an older version of the app, or seeded by
 * hand, may not have every field — this never throws on those.
 */
export function firestoreDocToConcept(
  doc: DocumentSnapshot<DocumentData> | QueryDocumentSnapshot<DocumentData>,
): Concept {
  const data = doc.data() ?? {};
  const base = initConcept(doc.id);
  return {
    ...base,
    title: typeof data['title'] === 'string' ? data['title'] : base.title,
    summary: typeof data['summary'] === 'string' ? data['summary'] : base.summary,
    markdown: typeof data['markdown'] === 'string' ? data['markdown'] : base.markdown,
    acknowledgement:
      typeof data['acknowledgement'] === 'string' ? data['acknowledgement'] : base.acknowledgement,
    tags: Array.isArray(data['tags']) ? data['tags'].filter((t) => typeof t === 'string') : [],
    imageUrl: typeof data['imageUrl'] === 'string' ? data['imageUrl'] : base.imageUrl,
    imageOriginalUrl:
      typeof data['imageOriginalUrl'] === 'string'
        ? data['imageOriginalUrl']
        : base.imageOriginalUrl,
    order: typeof data['order'] === 'number' ? data['order'] : base.order,
    published: data['published'] === true,
    created: typeof data['created'] === 'string' ? data['created'] : base.created,
    lastUpdated: typeof data['lastUpdated'] === 'string' ? data['lastUpdated'] : base.lastUpdated,
  };
}

/**
 * The shape written to Firestore. `slug` is deliberately dropped: it is the
 * document id, and storing it twice invites the two copies to disagree.
 */
export function conceptToFirestoreDoc(concept: Concept): DocumentData {
  const { slug: _slug, ...rest } = concept;
  return rest;
}

/**
 * Reads tags typed as one comma-separated line, e.g. `emotions, mathematics`.
 * Trims each one and drops empties and repeats, keeping the order written.
 */
export function parseTags(text: string): string[] {
  const tags = text
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '');
  return [...new Set(tags)];
}

/** Gallery order: curated `order` first, then title, so it is stable. */
export function compareConcepts(a: Concept, b: Concept): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.title.localeCompare(b.title);
}
