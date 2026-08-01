// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import { TypewriterThoughts, DEFAULT_THOUGHTS } from '../components/TypewriterThoughts.js';

/** jsdom has no matchMedia; every test declares what the reader prefers. */
function setReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  );
}

/** The animated line specifically — the sr-only sibling is also a paragraph. */
function animated(): string {
  return document.querySelector('p[aria-hidden="true"]')?.textContent ?? '';
}

/** Advance fake timers inside act(), so React flushes the state updates. */
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  setReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ONE = ['abcde'];

describe('TypewriterThoughts', () => {
  it('types a thought out one character at a time', async () => {
    render(<TypewriterThoughts thoughts={ONE} />);

    await advance(400); // initial delay, then first character
    expect(animated()).toBe('a');

    await advance(45);
    expect(animated()).toBe('ab');

    await advance(45 * 3);
    expect(animated()).toBe('abcde');
  });

  it('holds the finished line before deleting it', async () => {
    render(<TypewriterThoughts thoughts={ONE} />);

    await advance(400 + 45 * 4);
    expect(animated()).toBe('abcde');

    // Still fully shown partway through the hold — it must be readable.
    await advance(2000);
    expect(animated()).toBe('abcde');

    // 2600ms hold elapses here, firing exactly one delete tick.
    await advance(600);
    expect(animated()).toBe('abcd');
  });

  it('moves on to a different thought after deleting', async () => {
    render(<TypewriterThoughts thoughts={['ab', 'xy']} />);

    // The order is shuffled, so assert on the transition rather than on which
    // thought comes first — pinning the order made this fail ~1 run in 5.
    await advance(400);
    const first = animated();
    expect(['a', 'x']).toContain(first);

    // Finish typing, hold, delete both characters, gap, next first character.
    await advance(45 + 2600 + 22 + 22 + 500);
    const second = animated();
    expect(['a', 'x']).toContain(second);
    expect(second).not.toBe(first);
  });

  it('shows a static thought and no caret when reduced motion is preferred', async () => {
    setReducedMotion(true);
    render(<TypewriterThoughts thoughts={ONE} />);

    await advance(5000);
    expect(screen.getByText('abcde')).toBeDefined();
    expect(document.querySelector('.caret')).toBeNull();
  });

  // The animated line would otherwise announce every keystroke.
  it('exposes one stable sentence to screen readers and hides the animation', () => {
    render(<TypewriterThoughts thoughts={ONE} />);

    expect(document.querySelector('.sr-only')?.textContent).toBe('abcde');
    expect(document.querySelectorAll('p[aria-hidden="true"]')).toHaveLength(1);
  });

  it('clears its timer on unmount so it cannot type into a dead component', async () => {
    const { unmount } = render(<TypewriterThoughts thoughts={ONE} />);
    await advance(400);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('renders nothing animated when given no thoughts', async () => {
    render(<TypewriterThoughts thoughts={[]} />);
    await advance(5000);

    expect(animated()).toBe('');
  });

  it('ships a usable set of default thoughts', () => {
    expect(DEFAULT_THOUGHTS.length).toBeGreaterThan(5);
    for (const thought of DEFAULT_THOUGHTS) {
      expect(thought.length).toBeGreaterThan(10);
      expect(thought.length).toBeLessThan(90); // long lines break the layout
    }
  });
});
