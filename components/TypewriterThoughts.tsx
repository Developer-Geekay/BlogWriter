'use client';

import { useEffect, useRef, useState } from 'react';

/** Short lines worth reading while the blog is still empty. */
export const DEFAULT_THOUGHTS = [
  'Every system is a pile of decisions someone forgot to write down.',
  'The bug is usually in the part you were sure about.',
  'Most performance problems are something being done twice.',
  'Naming is hard because naming forces you to understand the thing.',
  'A comment explaining what the code does is noise. Why it does it is gold.',
  'Complexity you cannot explain out loud is complexity you do not understand.',
  'Good abstractions are discovered, not designed up front.',
  'Read the error message. Then read it again.',
  'The best debugging tool is a clear statement of what you expected.',
  'Every post starts as a bad first draft.',
] as const;

function shuffled(items: readonly string[]): string[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * Types a thought out, holds it, deletes it, moves to the next — shown on the
 * home page while nothing is published.
 *
 * Order is randomised on mount rather than on the server: picking at render time
 * would make the server and client markup disagree and blow up hydration.
 */
export function TypewriterThoughts({ thoughts = DEFAULT_THOUGHTS }: { thoughts?: readonly string[] }) {
  const [display, setDisplay] = useState('');
  /** Set instead of animating when the reader prefers reduced motion. */
  const [staticLine, setStaticLine] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (thoughts.length === 0) return;
    const order = shuffled(thoughts);

    // A looping animation is precisely what this preference exists to stop.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStaticLine(order[0]!);
      return;
    }

    let index = 0;
    let chars = 0;
    let deleting = false;

    const tick = () => {
      const line = order[index % order.length]!;

      if (!deleting) {
        chars += 1;
        setDisplay(line.slice(0, chars));
        if (chars >= line.length) {
          deleting = true;
          timer.current = setTimeout(tick, 2600); // hold, so it can be read
          return;
        }
        timer.current = setTimeout(tick, 45);
        return;
      }

      chars -= 1;
      setDisplay(line.slice(0, chars));
      if (chars <= 0) {
        deleting = false;
        index += 1;
        timer.current = setTimeout(tick, 500);
        return;
      }
      timer.current = setTimeout(tick, 22);
    };

    timer.current = setTimeout(tick, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [thoughts]);

  const line = 'article-body min-h-[4.5rem] text-2xl leading-snug sm:text-3xl';

  if (staticLine) {
    return <p className={line}>{staticLine}</p>;
  }

  return (
    <>
      {/* Screen readers get one stable sentence; announcing each keystroke of a
          looping animation would be unusable. */}
      <p className="sr-only">{thoughts[0]}</p>
      <p className={line} aria-hidden>
        {display}
        <span className="caret" />
      </p>
    </>
  );
}
