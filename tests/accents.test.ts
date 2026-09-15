import { describe, expect, it } from 'vitest';
import { ACCENTS, ACCENT_IDS, DEFAULT_ACCENT_ID, accentById, accentCss } from '../src/theme/accents.js';

/** The two grounds every accent has to survive. From app/globals.css. */
const GROUND_LIGHT = '#f3f2f2';
const GROUND_DARK = '#141312';

/**
 * WCAG 2.1 relative luminance and contrast ratio.
 *
 * Written out rather than pulled from a package: it is fifteen lines, and the
 * point of this file is to check the palette against the standard, not against
 * another dependency's reading of it.
 */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/**
 * `red` is the design system's specified brand accent. Its own readme puts the
 * accent-to-ground pair at roughly 3:1 — enough for chrome and display type,
 * not for small text — which is exactly why `lightText`/`darkText` exist. It is
 * held to the 3:1 floor on fills; everything else must clear 4.5:1.
 */
const BRAND_EXCEPTION = 'red';

describe('accent palette contrast', () => {
  it.each(ACCENTS.map((a) => [a.id, a] as const))(
    '%s keeps small text legible on both grounds',
    (_id, accent) => {
      // These two are non-negotiable: they are the mono micro-labels, which are
      // the smallest text in the interface.
      expect(contrast(accent.lightText, GROUND_LIGHT)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accent.darkText, GROUND_DARK)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(ACCENTS.map((a) => [a.id, a] as const))(
    '%s carries ground-coloured text on a solid fill',
    (id, accent) => {
      // Buttons and selected chips put --ground text on an accent field.
      const floor = id === BRAND_EXCEPTION ? 3 : 4.5;
      expect(contrast(GROUND_LIGHT, accent.light)).toBeGreaterThanOrEqual(floor);
      expect(contrast(GROUND_DARK, accent.dark)).toBeGreaterThanOrEqual(floor);
    },
  );

  it('keeps the brand red as the only entry below the stricter bar', () => {
    // If a future accent slips under 4.5 on a fill, this fails rather than
    // quietly widening the exception.
    const below = ACCENTS.filter(
      (a) =>
        contrast(GROUND_LIGHT, a.light) < 4.5 || contrast(GROUND_DARK, a.dark) < 4.5,
    ).map((a) => a.id);
    expect(below).toEqual([BRAND_EXCEPTION]);
  });

  it('puts each variant on the correct side for its ground', () => {
    for (const accent of ACCENTS) {
      // The dark-theme variant must be the lighter of the two — that is the
      // whole reason the pair exists, and getting it backwards would produce a
      // colour that vanishes into the ground it was picked for. Deliberately
      // not a minimum separation: the brand pair (#ec3013 / #ff563c) is only
      // 1.33:1 apart and is correct as specified.
      expect(
        luminance(accent.dark),
        `${accent.id}: the dark-ground variant is not lighter than the light-ground one`,
      ).toBeGreaterThanOrEqual(luminance(accent.light));
    }
  });
});

describe('accent palette integrity', () => {
  it('has unique ids', () => {
    expect(new Set(ACCENT_IDS).size).toBe(ACCENTS.length);
  });

  it('exposes a default that actually exists', () => {
    expect(ACCENTS.some((a) => a.id === DEFAULT_ACCENT_ID)).toBe(true);
  });

  it('falls back to a real accent for an unknown or missing id', () => {
    // The stored setting is validated at the API, but a value written directly
    // into the database must not take the site down.
    expect(accentById('nonsense').id).toBe(ACCENTS[0]!.id);
    expect(accentById(undefined).id).toBe(ACCENTS[0]!.id);
  });

  it('emits CSS that outranks the token declarations it overrides', () => {
    const css = accentCss(accentById('teal'));
    // `html:root` beats the plain `:root` the tokens are declared under, which
    // is what makes the override independent of stylesheet order.
    expect(css).toContain("html:root{");
    expect(css).toContain("html:root[data-theme='dark']{");
    expect(css).toContain('#1b5e5a');
    expect(css).toContain('#4fb3ac');
  });

  it('never interpolates anything but palette hex values into that CSS', () => {
    // The layout injects this with dangerouslySetInnerHTML, so the only thing
    // keeping it safe is that every value comes from the table.
    for (const accent of ACCENTS) {
      const values = accentCss(accent).match(/#[0-9a-f]{6}/gi) ?? [];
      expect(values.sort()).toEqual(
        [accent.light, accent.lightText, accent.dark, accent.darkText].sort(),
      );
    }
  });
});
