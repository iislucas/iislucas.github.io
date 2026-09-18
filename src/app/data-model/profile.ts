/* profile.ts
 *
 * The landing-page profile: the "who I am" content shown at the root of the
 * site. There is exactly one of these, at Firestore path `site/profile`, so
 * that the landing page is a single document read with no query.
 *
 * Everything here is public to read and admin-only to write, same as concepts.
 */

import { DocumentData, DocumentSnapshot } from 'firebase/firestore';

/** A labelled external link shown as a chip under the profile header. */
export interface ProfileLink {
  label: string;
  url: string;
}

export interface Profile {
  // Display name, shown as the page's H1.
  name: string;
  // One-line role/affiliation under the name.
  tagline: string;
  // The main body of the landing page, as markdown.
  bioMarkdown: string;
  // Optional portrait image URL.
  photoUrl: string;
  // The blurb at the top of the Concept Gallery, as markdown. It lives on the
  // profile because it is voice, not data: one editable piece of writing that
  // frames the gallery, rather than a property of any concept in it.
  galleryIntroMarkdown: string;
  // Outbound links (Scholar, GitHub, etc.), rendered in order.
  links: ProfileLink[];
  lastUpdated: string;
}

export const PROFILE_DOC_PATH = { collection: 'site', docId: 'profile' } as const;

export function initProfile(): Profile {
  return {
    name: '',
    tagline: '',
    bioMarkdown: '',
    photoUrl: '',
    galleryIntroMarkdown: '',
    links: [],
    lastUpdated: '',
  };
}

function toProfileLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .map((l) => ({
      label: typeof l['label'] === 'string' ? l['label'] : '',
      url: typeof l['url'] === 'string' ? l['url'] : '',
    }))
    .filter((l) => l.url !== '');
}

export function firestoreDocToProfile(doc: DocumentSnapshot<DocumentData>): Profile {
  const data = doc.data() ?? {};
  const base = initProfile();
  return {
    name: typeof data['name'] === 'string' ? data['name'] : base.name,
    tagline: typeof data['tagline'] === 'string' ? data['tagline'] : base.tagline,
    bioMarkdown: typeof data['bioMarkdown'] === 'string' ? data['bioMarkdown'] : base.bioMarkdown,
    photoUrl: typeof data['photoUrl'] === 'string' ? data['photoUrl'] : base.photoUrl,
    galleryIntroMarkdown:
      typeof data['galleryIntroMarkdown'] === 'string'
        ? data['galleryIntroMarkdown']
        : base.galleryIntroMarkdown,
    links: toProfileLinks(data['links']),
    lastUpdated: typeof data['lastUpdated'] === 'string' ? data['lastUpdated'] : base.lastUpdated,
  };
}
