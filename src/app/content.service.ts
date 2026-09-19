/* content.service.ts
 *
 * All Firestore reads and writes for the site's content: the concept gallery
 * and the landing-page profile.
 *
 * Both are kept live with `onSnapshot`, so an edit made in one tab (or by the
 * seed script) shows up everywhere without a reload, and both are exposed as
 * signals for zoneless templates.
 *
 * Visibility: anonymous visitors can only read published concepts, so the
 * gallery query is `where('published', '==', true)` for them, and unfiltered
 * for an admin (who should see their own drafts). The listener is rebuilt when
 * admin status changes — see the effect in the constructor.
 */

import { computed, effect, inject, Injectable, signal } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { FIREBASE_APP } from './app.config';
import { FirebaseStateService } from './firebase-state.service';
import {
  compareConcepts,
  Concept,
  conceptToFirestoreDoc,
  firestoreDocToConcept,
  initConcept,
  slugify,
} from './data-model/concept';
import {
  firestoreDocToProfile,
  initProfile,
  Profile,
  PROFILE_DOC_PATH,
} from './data-model/profile';

export const CONCEPTS_COLLECTION = 'concepts';

export type SaveResult = { success: true } | { success: false; message: string };

// A created concept reports the slug it was given, which is where it now lives.
export type CreateResult = { success: true; slug: string } | { success: false; message: string };

@Injectable({ providedIn: 'root' })
export class ContentService {
  private app = inject(FIREBASE_APP);
  private firebaseState = inject(FirebaseStateService);
  private db: Firestore;

  private conceptsUnsubscribe: Unsubscribe | null = null;
  private profileUnsubscribe: Unsubscribe | null = null;

  /** All concepts visible to the current user, in gallery order. */
  public concepts = signal<Concept[]>([]);
  public conceptsLoaded = signal(false);
  public conceptsError = signal<string | null>(null);

  public profile = signal<Profile>(initProfile());
  public profileLoaded = signal(false);

  /** Every tag in use, de-duplicated and sorted, for the gallery's filter row. */
  public allTags = computed(() => {
    const tags = new Set<string>();
    for (const concept of this.concepts()) {
      for (const tag of concept.tags) tags.add(tag);
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  });

  constructor() {
    this.db = getFirestore(this.app);
    this.subscribeToProfile();

    // Re-subscribe whenever admin status changes: an admin's query includes
    // unpublished drafts, an anonymous visitor's cannot (the rules reject it).
    effect(() => {
      const isAdmin = this.firebaseState.isAdmin();
      this.subscribeToConcepts(isAdmin);
    });
  }

  private subscribeToConcepts(includeDrafts: boolean) {
    this.conceptsUnsubscribe?.();
    const conceptsRef = collection(this.db, CONCEPTS_COLLECTION);
    const conceptsQuery = includeDrafts
      ? query(conceptsRef)
      : query(conceptsRef, where('published', '==', true));

    this.conceptsUnsubscribe = onSnapshot(
      conceptsQuery,
      (snapshot) => {
        this.concepts.set(snapshot.docs.map(firestoreDocToConcept).sort(compareConcepts));
        this.conceptsLoaded.set(true);
        this.conceptsError.set(null);
      },
      (error) => {
        console.error('ContentService: concepts listener failed', error);
        this.conceptsError.set(
          'Could not load concepts. Check your Firebase config and Firestore rules (see SETUP.md).',
        );
        this.conceptsLoaded.set(true);
      },
    );
  }

  private subscribeToProfile() {
    this.profileUnsubscribe?.();
    const profileRef = doc(this.db, PROFILE_DOC_PATH.collection, PROFILE_DOC_PATH.docId);
    this.profileUnsubscribe = onSnapshot(
      profileRef,
      (snapshot) => {
        this.profile.set(snapshot.exists() ? firestoreDocToProfile(snapshot) : initProfile());
        this.profileLoaded.set(true);
      },
      (error) => {
        console.error('ContentService: profile listener failed', error);
        this.profileLoaded.set(true);
      },
    );
  }

  /**
   * The concept with this slug, from the already-loaded set. Returns undefined
   * while the first snapshot is still in flight, so callers should check
   * `conceptsLoaded()` before treating that as "not found".
   */
  public conceptBySlug(slug: string): Concept | undefined {
    return this.concepts().find((c) => c.slug === slug);
  }

  /**
   * Creates a new, unpublished concept with just a title, and returns its
   * slug. The slug is derived from the title and is fixed from then on: it is
   * the document id and the URL, and changing it would break links.
   */
  public async createConcept(title: string): Promise<CreateResult> {
    const slug = slugify(title);
    if (!slug) {
      return { success: false, message: 'The title needs at least one letter or digit.' };
    }
    // Creating over an existing slug would silently replace that concept.
    if ((await getDoc(doc(this.db, CONCEPTS_COLLECTION, slug))).exists()) {
      return { success: false, message: `A concept already exists at /concepts/${slug}.` };
    }
    const now = new Date().toISOString();
    // New concepts go to the end of the gallery; the order is editable after.
    const lastOrder = Math.max(0, ...this.concepts().map((c) => c.order));
    const concept: Concept = {
      ...initConcept(slug),
      title: title.trim(),
      order: lastOrder + 10,
      created: now,
      lastUpdated: now,
    };
    try {
      await setDoc(doc(this.db, CONCEPTS_COLLECTION, slug), conceptToFirestoreDoc(concept));
      return { success: true, slug };
    } catch (error) {
      console.error('ContentService: createConcept failed', error);
      return { success: false, message: describeWriteError(error) };
    }
  }

  /** Writes some of a concept's fields, leaving the rest as they are. */
  public async updateConcept(slug: string, changes: Partial<Concept>): Promise<SaveResult> {
    const { slug: _slug, ...fields } = changes;
    const update: Partial<Concept> = { ...fields, lastUpdated: new Date().toISOString() };
    try {
      await updateDoc(doc(this.db, CONCEPTS_COLLECTION, slug), update);
      return { success: true };
    } catch (error) {
      console.error('ContentService: updateConcept failed', error);
      return { success: false, message: describeWriteError(error) };
    }
  }

  public async deleteConcept(slug: string): Promise<SaveResult> {
    try {
      await deleteDoc(doc(this.db, CONCEPTS_COLLECTION, slug));
      return { success: true };
    } catch (error) {
      console.error('ContentService: deleteConcept failed', error);
      return { success: false, message: describeWriteError(error) };
    }
  }

  /**
   * Writes some of the profile's fields. A merge rather than an update, so
   * that the first edit on a fresh project creates the document.
   */
  public async updateProfile(changes: Partial<Profile>): Promise<SaveResult> {
    const update: Partial<Profile> = { ...changes, lastUpdated: new Date().toISOString() };
    try {
      await setDoc(doc(this.db, PROFILE_DOC_PATH.collection, PROFILE_DOC_PATH.docId), update, {
        merge: true,
      });
      return { success: true };
    } catch (error) {
      console.error('ContentService: updateProfile failed', error);
      return { success: false, message: describeWriteError(error) };
    }
  }
}

/**
 * Turns a Firestore write error into something worth showing a person. The
 * common case by far is a rules refusal, which means the signed-in account has
 * no admin ACL document — that is a setup step, so say so.
 */
function describeWriteError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code === 'permission-denied') {
    return 'Firestore refused the write: this account is not an admin. Add an `acl/<your-email>` document with `isAdmin: true` (see SETUP.md).';
  }
  if (code === 'unavailable') {
    return 'Could not reach Firestore. Check your network connection and try again.';
  }
  return (error as { message?: string })?.message ?? 'The save failed for an unknown reason.';
}
