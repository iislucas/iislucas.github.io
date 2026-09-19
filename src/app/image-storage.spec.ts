import { describe, it, expect } from 'vitest';
import { imageStoragePath, safeFileName } from './image-storage';

describe('safeFileName', () => {
  it('keeps letters, digits, dots, dashes and underscores', () => {
    expect(safeFileName('photo-1_final.png')).toBe('photo-1_final.png');
  });

  it('replaces everything else', () => {
    expect(safeFileName('my photo (1).png')).toBe('my_photo__1_.png');
  });

  it('falls back to a generic name when nothing usable is left', () => {
    expect(safeFileName('ßß')).toBe('image');
  });
});

describe('imageStoragePath', () => {
  it('puts uploads under images/ with a timestamp', () => {
    expect(imageStoragePath('concepts/inner-gold', 'hero.png', 123)).toBe(
      'images/concepts/inner-gold/123_hero.png',
    );
  });

  it('never lets a folder climb out of images/', () => {
    expect(imageStoragePath('../secrets', 'x.png', 1)).toBe('images/secrets/1_x.png');
    expect(imageStoragePath('', 'x.png', 1)).toBe('images/1_x.png');
  });
});
