// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Markdown } from '../components/Markdown.js';

afterEach(cleanup);

const fence = (info: string, body: string) => '```' + info + '\n' + body + '\n```';

/** The rendered <pre> for the first code block on screen. */
const block = () => document.querySelector('pre')!;
const code = () => document.querySelector('pre code')!;

describe('code blocks', () => {
  it('highlights a fenced block', async () => {
    render(<Markdown>{fence('python', 'x = "hello"  # note')}</Markdown>);

    // Highlighting turns the flat string into classed spans; without it the
    // block renders as undifferentiated monospace.
    expect(code().querySelectorAll('span.hljs-string').length).toBeGreaterThan(0);
    expect(code().querySelectorAll('span.hljs-comment').length).toBeGreaterThan(0);
  });

  it('labels the block with its language', () => {
    render(<Markdown>{fence('python', 'x = 1')}</Markdown>);
    expect(screen.getByText('python')).toBeDefined();
  });

  it('labels it with the filename when the fence carries one', () => {
    render(<Markdown>{fence('go:worker.go', 'func main() {}')}</Markdown>);
    expect(screen.getByText('worker.go')).toBeDefined();
  });

  it('still highlights when a filename is attached', () => {
    // The regression this convention caused: `language-go:worker.go` is a
    // language highlight.js has never heard of, so the block came back plain
    // exactly when the author bothered to label it.
    render(<Markdown>{fence('go:worker.go', 'func main() { return }')}</Markdown>);

    expect(code().className).toContain('language-go');
    expect(code().className).not.toContain('worker.go');
    expect(code().querySelectorAll('span.hljs-keyword').length).toBeGreaterThan(0);
  });

  it('renders an unknown language as plain code rather than failing', () => {
    // ignoreMissing — a typo in the fence must not take the whole entry down.
    expect(() =>
      render(<Markdown>{fence('nosuchlang', 'some text')}</Markdown>),
    ).not.toThrow();
    expect(block().textContent).toContain('some text');
  });

  it('renders a bare fence', () => {
    render(<Markdown>{fence('', 'plain text here')}</Markdown>);
    expect(block().textContent).toContain('plain text here');
  });

  it('keeps the source intact for copying, spans and all', () => {
    const source = 'def f(x):\n    return "y"  # done';
    render(<Markdown>{fence('python', source)}</Markdown>);

    // textContent walks the highlighted tree, so this is what the copy button
    // gathers. It must equal what the author wrote.
    expect(code().textContent!.trimEnd()).toBe(source);
  });

  it('leaves inline code unhighlighted and unboxed', () => {
    render(<Markdown>{'Use `npm run dev` to start.'}</Markdown>);

    expect(document.querySelector('pre')).toBeNull();
    const inline = document.querySelector('code')!;
    expect(inline.className).not.toContain('hljs');
    expect(inline.textContent).toBe('npm run dev');
  });
});
