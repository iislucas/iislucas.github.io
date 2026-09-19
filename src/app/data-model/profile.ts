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

/**
 * One of the papers picked out as a personal favourite, with the note saying
 * why. A paper is identified by whichever handles it has: an arXiv id (which
 * gives an alphaXiv link), a Google Scholar citation id (which, with the
 * profile's `scholarUserId`, gives a Scholar link), and/or a plain URL for
 * anything else — a project page, an explorable, a publisher's site. None of
 * them is required, and a paper with none is simply shown unlinked.
 */
export interface FavouritePaper {
  title: string;
  // Publication year, as text: it is only ever displayed, never sorted on.
  year: string;
  // An arXiv id such as `2401.06102`; a full arXiv or alphaXiv URL is also
  // accepted and reduced to the id when the link is built.
  arxivId: string;
  // The per-paper half of Scholar's `citation_for_view=<user>:<citation>`,
  // e.g. `8AbLer7MMksC`. A whole Scholar citation URL is also accepted.
  scholarCitationId: string;
  // Any other link for the paper, used as-is.
  url: string;
  // Markdown: what the author likes about this piece of work.
  whyMarkdown: string;
}

export interface Profile {
  // Display name, shown as the page's H1.
  name: string;
  // One-line role/affiliation under the name.
  tagline: string;
  // The main body of the landing page, as markdown.
  bioMarkdown: string;
  // Optional portrait image URL: the square crop that is shown. The uncropped
  // upload is kept in `photoOriginalUrl`, so the crop can be redone.
  photoUrl: string;
  photoOriginalUrl: string;
  // The blurb at the top of the Concept Gallery, as markdown. It lives on the
  // profile because it is voice, not data: one editable piece of writing that
  // frames the gallery, rather than a property of any concept in it.
  galleryIntroMarkdown: string;
  // Outbound links (Scholar, GitHub, etc.), rendered in order.
  links: ProfileLink[];
  // The Google Scholar profile id, e.g. `nDs3-TMAAAAJ` — the `user` parameter
  // of a Scholar profile URL. Every per-paper Scholar link is built from this
  // plus the paper's own citation id, so it is stored once rather than being
  // repeated in each paper's URL.
  scholarUserId: string;
  // The heading of the favourite papers section.
  favouritePapersTitle: string;
  // The blurb above the favourite papers, as markdown. Same reasoning as
  // `galleryIntroMarkdown`: it frames the list rather than belonging to it.
  favouritePapersIntroMarkdown: string;
  // Hand-picked papers with a note on each, in the order they are shown.
  favouritePapers: FavouritePaper[];
  lastUpdated: string;
}

export const PROFILE_DOC_PATH = { collection: 'site', docId: 'profile' } as const;

/** Where a paper link points, which is also what its chip is labelled with. */
export enum PaperLinkKind {
  AlphaXiv = 'alphaXiv',
  Scholar = 'Google Scholar',
  Other = 'other',
}

export interface PaperLink {
  kind: PaperLinkKind;
  // What to show on the chip. For `Other` this is the link's host, since the
  // destination is whatever the author pasted and has no fixed name.
  label: string;
  url: string;
}

export function initProfile(): Profile {
  return {
    name: '',
    tagline: '',
    bioMarkdown: '',
    photoUrl: '',
    photoOriginalUrl: '',
    galleryIntroMarkdown: '',
    links: [],
    scholarUserId: '',
    favouritePapersTitle: 'Favourite papers',
    favouritePapersIntroMarkdown: '',
    favouritePapers: [],
    lastUpdated: '',
  };
}

export function initFavouritePaper(): FavouritePaper {
  return {
    title: '',
    year: '',
    arxivId: '',
    scholarCitationId: '',
    url: '',
    whyMarkdown: '',
  };
}

/**
 * Reduces anything that identifies an arXiv paper to the bare id, so that both
 * `2401.06102v2` and `https://arxiv.org/abs/2401.06102` yield `2401.06102`.
 * Returns '' when the input is not recognisable as an arXiv id, which is the
 * signal to leave the alphaXiv link out rather than build a broken one.
 */
export function normalizeArxivId(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '') return '';
  // An arXiv, alphaXiv or mirror URL: everything after /abs/, /pdf/ etc. is
  // the id. Anything else is treated as an id already.
  const fromUrl = trimmed.match(/(?:arxiv|alphaxiv)\.org\/(?:abs|pdf|html|overview)\/(.+)$/i);
  const candidate = (fromUrl ? fromUrl[1] : trimmed).split(/[?#]/)[0].replace(/\.pdf$/i, '');
  // Post-2007 ids (`2401.06102`) and the older archive/number form
  // (`math.GT/0309136`), each optionally carrying a version suffix.
  const modern = candidate.match(/^(\d{4}\.\d{4,5})(?:v\d+)?$/);
  if (modern) return modern[1];
  const legacy = candidate.match(/^([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/);
  if (legacy) return legacy[1];
  return '';
}

/**
 * Reads a query parameter out of a Google Scholar URL. Done with a regex
 * rather than `URL`, because what gets pasted is often a fragment of one.
 * Returns null when the parameter is absent.
 */
function scholarQueryParam(input: string, name: string): string | null {
  const match = input.match(new RegExp(`[?&]${name}=([^&#\\s]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * The Scholar profile id, from either the bare id or a pasted profile URL
 * (`…/citations?user=nDs3-TMAAAAJ&hl=en`). Returns '' if neither is found.
 */
export function normalizeScholarUserId(input: string): string {
  const trimmed = input.trim();
  const fromUrl = scholarQueryParam(trimmed, 'user');
  if (fromUrl) return fromUrl;
  return /^[\w-]+$/.test(trimmed) ? trimmed : '';
}

/**
 * The per-paper half of a Scholar citation id, from either the bare id or a
 * pasted citation URL, whose `citation_for_view` parameter carries it as
 * `<userId>:<citationId>`. Returns '' if neither is found.
 */
export function normalizeScholarCitationId(input: string): string {
  const trimmed = input.trim();
  const fromUrl = scholarQueryParam(trimmed, 'citation_for_view');
  if (fromUrl) return fromUrl.split(':')[1] ?? '';
  return /^[\w-]+$/.test(trimmed) ? trimmed : '';
}

/** The alphaXiv page for an arXiv id, or '' when the id is unusable. */
export function alphaXivUrl(arxivId: string): string {
  const id = normalizeArxivId(arxivId);
  return id === '' ? '' : `https://www.alphaxiv.org/abs/${id}`;
}

/** A Scholar profile page, or '' when there is no profile id. */
export function scholarProfileUrl(scholarUserId: string): string {
  const user = normalizeScholarUserId(scholarUserId);
  return user === '' ? '' : `https://scholar.google.com/citations?user=${user}&hl=en`;
}

/** A single paper's Scholar page, which needs both ids to address. */
export function scholarCitationUrl(scholarUserId: string, scholarCitationId: string): string {
  const user = normalizeScholarUserId(scholarUserId);
  const citation = normalizeScholarCitationId(scholarCitationId);
  if (user === '' || citation === '') return '';
  return (
    `https://scholar.google.com/citations?view_op=view_citation&hl=en` +
    `&user=${user}&citation_for_view=${user}:${citation}`
  );
}

/** The host of a URL, for labelling a link whose destination has no set name. */
function hostLabel(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Every link a paper has, in the order they are shown. alphaXiv comes first
 * and so is the one the title links to: that is the reading copy, with notes
 * and discussion on top of the arXiv paper.
 */
export function paperLinks(paper: FavouritePaper, scholarUserId: string): PaperLink[] {
  const links: PaperLink[] = [];
  const alphaXiv = alphaXivUrl(paper.arxivId);
  if (alphaXiv !== '') {
    links.push({ kind: PaperLinkKind.AlphaXiv, label: 'alphaXiv', url: alphaXiv });
  }
  const other = paper.url.trim();
  if (other !== '') {
    links.push({ kind: PaperLinkKind.Other, label: hostLabel(other), url: other });
  }
  const scholar = scholarCitationUrl(scholarUserId, paper.scholarCitationId);
  if (scholar !== '') {
    links.push({ kind: PaperLinkKind.Scholar, label: 'Scholar', url: scholar });
  }
  return links;
}

function toProfileLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) return [];
  return (
    value
      .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
      .map((l) => ({
        label: typeof l['label'] === 'string' ? l['label'] : '',
        url: typeof l['url'] === 'string' ? l['url'] : '',
      }))
      // A link just added in edit mode has a label but no URL yet; keep it, so
      // that it survives long enough to be filled in.
      .filter((l) => l.url !== '' || l.label !== '')
  );
}

function toFavouritePapers(value: unknown): FavouritePaper[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => {
      const base = initFavouritePaper();
      const text = (key: keyof FavouritePaper): string =>
        typeof p[key] === 'string' ? (p[key] as string) : base[key];
      return {
        title: text('title'),
        year: text('year'),
        arxivId: text('arxivId'),
        scholarCitationId: text('scholarCitationId'),
        url: text('url'),
        whyMarkdown: text('whyMarkdown'),
      };
    })
    .filter((p) => p.title !== '');
}

export function firestoreDocToProfile(doc: DocumentSnapshot<DocumentData>): Profile {
  const data = doc.data() ?? {};
  const base = initProfile();
  return {
    name: typeof data['name'] === 'string' ? data['name'] : base.name,
    tagline: typeof data['tagline'] === 'string' ? data['tagline'] : base.tagline,
    bioMarkdown: typeof data['bioMarkdown'] === 'string' ? data['bioMarkdown'] : base.bioMarkdown,
    photoUrl: typeof data['photoUrl'] === 'string' ? data['photoUrl'] : base.photoUrl,
    photoOriginalUrl:
      typeof data['photoOriginalUrl'] === 'string'
        ? data['photoOriginalUrl']
        : base.photoOriginalUrl,
    galleryIntroMarkdown:
      typeof data['galleryIntroMarkdown'] === 'string'
        ? data['galleryIntroMarkdown']
        : base.galleryIntroMarkdown,
    links: toProfileLinks(data['links']),
    scholarUserId:
      typeof data['scholarUserId'] === 'string' ? data['scholarUserId'] : base.scholarUserId,
    favouritePapersTitle:
      typeof data['favouritePapersTitle'] === 'string' && data['favouritePapersTitle'] !== ''
        ? data['favouritePapersTitle']
        : base.favouritePapersTitle,
    favouritePapersIntroMarkdown:
      typeof data['favouritePapersIntroMarkdown'] === 'string'
        ? data['favouritePapersIntroMarkdown']
        : base.favouritePapersIntroMarkdown,
    favouritePapers: toFavouritePapers(data['favouritePapers']),
    lastUpdated: typeof data['lastUpdated'] === 'string' ? data['lastUpdated'] : base.lastUpdated,
  };
}
