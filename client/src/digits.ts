/**
 * Tiny5 (the UI font) draws "4" almost like "d", so "0.000444" can read as "0.000ddd".
 * Numbers and "$" use Silkscreen instead: a sibling pixel font on the same 2px grid with
 * unmistakable digits, via a unicode-range face that sits in front of Tiny5 in the stack.
 */
import silkscreen from '@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff2?url';

export async function loadDigitFont(): Promise<void> {
  try {
    const face = new FontFace('RV Digits', `url(${silkscreen}) format('woff2')`, {
      unicodeRange: 'U+0024, U+0030-0039',
      display: 'block',
    });
    document.fonts.add(await face.load());
  } catch {
    /* falls back to Tiny5 digits */
  }
}
