/**
 * The accent palette an operator can choose from.
 *
 * A fixed set rather than a free colour picker, and each entry carries four
 * values rather than one. The reason is contrast: a colour that works as a
 * solid fill on the light ground is usually too dark to read against #141312,
 * and the design system's own guidance is that the base accent is only tuned to
 * about 3:1 — fine for fills and rules, not for small text. So every accent
 * declares a light and a dark variant, plus the deeper step small text uses on
 * each ground. Picking these by hand is what keeps the site legible in both
 * themes; a picker returning an arbitrary hex could not.
 */
export interface Accent {
  /** Stable key stored in settings. */
  id: string;
  label: string;
  /** Fills, rules and display type. */
  light: string;
  dark: string;
  /** Small text and mono labels, where the base accent is too weak. */
  lightText: string;
  darkText: string;
}

export const ACCENTS: readonly Accent[] = [
  {
    id: 'red',
    label: 'Signal red',
    light: '#ec3013',
    dark: '#ff563c',
    lightText: '#ae1800',
    darkText: '#ff8f7c',
  },
  {
    id: 'ink',
    label: 'Ink',
    light: '#201e1d',
    dark: '#f3f2f2',
    lightText: '#201e1d',
    darkText: '#f3f2f2',
  },
  {
    id: 'teal',
    label: 'Deep teal',
    light: '#1b5e5a',
    dark: '#4fb3ac',
    lightText: '#14453f',
    darkText: '#7fd0ca',
  },
  {
    id: 'blue',
    label: 'Ultramarine',
    light: '#2d3ea8',
    dark: '#8b97f2',
    lightText: '#232f80',
    darkText: '#aab3f7',
  },
] as const;

export const DEFAULT_ACCENT_ID = 'red';

export const ACCENT_IDS = ACCENTS.map((a) => a.id) as [string, ...string[]];

export function accentById(id: string | undefined): Accent {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0]!;
}

/**
 * CSS that repoints the accent tokens at the chosen palette entry.
 *
 * Emitted into `<head>` by the root layout rather than set as an inline style
 * on `<html>`: an inline custom property would beat the `[data-theme='dark']`
 * rule in the stylesheet, freezing the accent at its light value in dark mode.
 * `html:root` outranks the plain `:root` the tokens are declared under, so this
 * wins regardless of where the framework injects the stylesheet.
 *
 * The layout injects the result with `dangerouslySetInnerHTML`, which is safe
 * only because every value here comes from the table above: the argument is an
 * `Accent`, `accentById` falls back to a known entry for an unrecognised id,
 * and the settings API accepts nothing outside `ACCENT_IDS`. No operator input
 * reaches this string. Keep it that way — interpolating a stored colour here
 * would be a stylesheet injection.
 */
export function accentCss(accent: Accent): string {
  return [
    `html:root{--color-accent:${accent.light};--accent-text:${accent.lightText};}`,
    `html:root[data-theme='dark']{--color-accent:${accent.dark};--accent-text:${accent.darkText};}`,
  ].join('');
}
