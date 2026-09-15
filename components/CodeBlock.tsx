'use client';

import { isValidElement, useState, type ReactNode } from 'react';

/**
 * A fenced code block with a label bar and a copy button.
 *
 * The label is the fence's info string. A bare ```` ```go ```` labels the block
 * "go"; ```` ```go:worker.go ```` labels it "worker.go", which is what the
 * design shows. Markdown has no standard for a filename on a fence, and the
 * colon form is the one most renderers converged on, so it is what authors and
 * the MCP client are most likely to already write.
 */
export function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);

  const { label, text } = read(children);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard access can be refused (insecure origin, permissions). The
      // block is still selectable by hand, so this fails quietly rather than
      // showing an error for something the reader can work around.
    }
  }

  return (
    <div className="mb-5 border-2 border-[var(--rule)]">
      <div className="flex items-center justify-between gap-2 border-b-2 border-[var(--rule)] bg-[var(--panel)] px-2.5 py-1.5">
        <span className="truncate font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex-none border border-[var(--soft)] px-1.5 py-0.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--ink)] hover:bg-[var(--ground)]"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto bg-[var(--panel)] p-3.5 font-[family-name:var(--mono)] text-[13px] leading-[1.6] text-[var(--ink)]">
        {children}
      </pre>
    </div>
  );
}

/**
 * Pull the label and the raw text out of the `<code>` element react-markdown
 * nests inside every `<pre>`.
 */
function read(children: ReactNode): { label: string; text: string } {
  if (!isValidElement<{ className?: string; children?: ReactNode }>(children)) {
    return { label: 'CODE', text: '' };
  }

  const className = children.props.className ?? '';
  const info = /language-([^\s]+)/.exec(className)?.[1] ?? '';
  // `go:worker.go` — the part after the colon is a filename, and it wins.
  const [language, filename] = info.split(':');

  const raw = children.props.children;
  const text = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join('') : '';

  return { label: filename || language || 'CODE', text };
}
