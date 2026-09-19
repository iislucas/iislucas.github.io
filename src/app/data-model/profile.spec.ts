import { describe, it, expect } from 'vitest';
import {
  alphaXivUrl,
  FavouritePaper,
  firestoreDocToProfile,
  initFavouritePaper,
  initProfile,
  normalizeArxivId,
  normalizeScholarCitationId,
  normalizeScholarUserId,
  PaperLinkKind,
  paperLinks,
  scholarCitationUrl,
  scholarProfileUrl,
} from './profile';
import { DocumentData, DocumentSnapshot } from 'firebase/firestore';

/** A stand-in for a Firestore snapshot: just the two things the reader uses. */
function fakeDoc(data: Record<string, unknown> | undefined) {
  return { id: 'profile', data: () => data } as unknown as DocumentSnapshot<DocumentData>;
}

function paperWith(fields: Partial<FavouritePaper>): FavouritePaper {
  return { ...initFavouritePaper(), ...fields };
}

describe('normalizeArxivId', () => {
  it('passes a bare modern id through', () => {
    expect(normalizeArxivId('2401.06102')).toBe('2401.06102');
  });

  it('drops the version suffix', () => {
    expect(normalizeArxivId('2401.06102v2')).toBe('2401.06102');
  });

  it('pulls the id out of an arXiv abstract URL', () => {
    expect(normalizeArxivId('https://arxiv.org/abs/2312.03656')).toBe('2312.03656');
  });

  it('pulls the id out of a PDF URL', () => {
    expect(normalizeArxivId('https://arxiv.org/pdf/2404.07498v1.pdf')).toBe('2404.07498');
  });

  it('accepts an alphaXiv URL, so a round trip is idempotent', () => {
    expect(normalizeArxivId('https://www.alphaxiv.org/abs/2503.03654')).toBe('2503.03654');
  });

  it('understands the pre-2007 archive/number form', () => {
    expect(normalizeArxivId('math.GT/0309136')).toBe('math.GT/0309136');
  });

  it('returns empty for anything that is not an arXiv id', () => {
    expect(normalizeArxivId('https://pair.withgoogle.com/explorables/grokking/')).toBe('');
    expect(normalizeArxivId('')).toBe('');
  });
});

describe('normalizeScholarUserId', () => {
  it('passes a bare id through', () => {
    expect(normalizeScholarUserId('nDs3-TMAAAAJ')).toBe('nDs3-TMAAAAJ');
  });

  it('reads the user parameter out of a profile URL', () => {
    expect(
      normalizeScholarUserId('https://scholar.google.com/citations?user=nDs3-TMAAAAJ&hl=en&oi=ao'),
    ).toBe('nDs3-TMAAAAJ');
  });

  it('returns empty for a URL with no user parameter', () => {
    expect(normalizeScholarUserId('https://scholar.google.com/')).toBe('');
  });
});

describe('normalizeScholarCitationId', () => {
  it('passes a bare id through', () => {
    expect(normalizeScholarCitationId('8AbLer7MMksC')).toBe('8AbLer7MMksC');
  });

  it('takes the citation half of citation_for_view', () => {
    expect(
      normalizeScholarCitationId(
        'https://scholar.google.com/citations?view_op=view_citation&hl=en' +
          '&user=nDs3-TMAAAAJ&citation_for_view=nDs3-TMAAAAJ:8AbLer7MMksC',
      ),
    ).toBe('8AbLer7MMksC');
  });

  it('returns empty when the parameter carries no citation half', () => {
    expect(
      normalizeScholarCitationId('https://scholar.google.com/citations?citation_for_view=x'),
    ).toBe('');
  });
});

describe('link builders', () => {
  it('builds an alphaXiv URL from any arXiv handle', () => {
    expect(alphaXivUrl('2401.06102v3')).toBe('https://www.alphaxiv.org/abs/2401.06102');
  });

  it('builds no alphaXiv URL without a usable id', () => {
    expect(alphaXivUrl('not an id')).toBe('');
  });

  it('builds a Scholar profile URL', () => {
    expect(scholarProfileUrl('nDs3-TMAAAAJ')).toBe(
      'https://scholar.google.com/citations?user=nDs3-TMAAAAJ&hl=en',
    );
  });

  it('repeats the user id on both sides of a citation URL', () => {
    expect(scholarCitationUrl('nDs3-TMAAAAJ', '8AbLer7MMksC')).toContain(
      'citation_for_view=nDs3-TMAAAAJ:8AbLer7MMksC',
    );
  });

  it('builds no citation URL when either half is missing', () => {
    expect(scholarCitationUrl('', '8AbLer7MMksC')).toBe('');
    expect(scholarCitationUrl('nDs3-TMAAAAJ', '')).toBe('');
  });
});

describe('paperLinks', () => {
  it('puts alphaXiv first, so it is what the title links to', () => {
    const links = paperLinks(
      paperWith({
        arxivId: '2401.06102',
        url: 'https://pair.withgoogle.com/explorables/patchscopes/',
        scholarCitationId: '8AbLer7MMksC',
      }),
      'nDs3-TMAAAAJ',
    );
    expect(links.map((l) => l.kind)).toEqual([
      PaperLinkKind.AlphaXiv,
      PaperLinkKind.Other,
      PaperLinkKind.Scholar,
    ]);
    expect(links[0].url).toBe('https://www.alphaxiv.org/abs/2401.06102');
  });

  it('labels an other link with its host, minus the www', () => {
    const links = paperLinks(
      paperWith({ url: 'https://www.pair.withgoogle.com/explorables/grokking/' }),
      '',
    );
    expect(links).toEqual([
      {
        kind: PaperLinkKind.Other,
        label: 'pair.withgoogle.com',
        url: 'https://www.pair.withgoogle.com/explorables/grokking/',
      },
    ]);
  });

  it('omits the Scholar link when the profile has no Scholar id', () => {
    const links = paperLinks(paperWith({ scholarCitationId: '8AbLer7MMksC' }), '');
    expect(links).toEqual([]);
  });

  it('returns nothing for a paper with no handles at all', () => {
    expect(paperLinks(paperWith({ title: 'Unpublished' }), 'nDs3-TMAAAAJ')).toEqual([]);
  });
});

describe('firestoreDocToProfile', () => {
  it('defaults every field when the document is empty', () => {
    expect(firestoreDocToProfile(fakeDoc({}))).toEqual(initProfile());
  });

  it('reads favourite papers, filling in absent fields', () => {
    const profile = firestoreDocToProfile(
      fakeDoc({
        scholarUserId: 'nDs3-TMAAAAJ',
        favouritePapers: [{ title: 'Patchscopes', arxivId: '2401.06102' }],
      }),
    );
    expect(profile.scholarUserId).toBe('nDs3-TMAAAAJ');
    expect(profile.favouritePapers).toEqual([
      paperWith({ title: 'Patchscopes', arxivId: '2401.06102' }),
    ]);
  });

  it('drops papers with no title and anything that is not a paper', () => {
    const profile = firestoreDocToProfile(
      fakeDoc({ favouritePapers: [{ arxivId: '2401.06102' }, 'nonsense', null] }),
    );
    expect(profile.favouritePapers).toEqual([]);
  });

  it('ignores a favouritePapers field that is not a list', () => {
    expect(firestoreDocToProfile(fakeDoc({ favouritePapers: 'no' })).favouritePapers).toEqual([]);
  });
});
