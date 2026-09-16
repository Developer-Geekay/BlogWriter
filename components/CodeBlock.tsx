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
  if (
    !isValidElement<{ className?: string; children?: ReactNode; 'data-filename'?: string }>(
      children,
    )
  ) {
    return { label: 'CODE', text: '' };
  }

  const className = children.props.className ?? '';
  const language = /language-([^\s]+)/.exec(className)?.[1] ?? '';
  // Split off the `lang:filename` convention upstream, by rehypeCodeMeta, so
  // that highlighting sees a language it recognises. The filename it set aside
  // is the better label when there is one.
  const filename = children.props['data-filename'] ?? '';

  return {
    label: filename || (language === 'plaintext' ? '' : language) || 'CODE',
    // Highlighting replaces the plain string child with a tree of coloured
    // spans, so the text for the clipboard has to be gathered from all of it
    // rather than read off a single child.
    text: textOf(children.props.children),
  };
}

/** Flatten a highlighted node tree back to the source the author wrote. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}
