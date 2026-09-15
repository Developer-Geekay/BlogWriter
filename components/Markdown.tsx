import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from '@/components/CodeBlock';
import { headingId } from '@/src/content/outline';

/**
 * Anchor id for a rendered heading, matching what `extractOutline` computed for
 * the same text. Both go through `headingId`, so the sidebar's links and the
 * headings they point at cannot drift.
 */
function anchor(children: ReactNode): string | undefined {
  const text = typeof children === 'string' ? children : Array.isArray(children) ? children.filter((c) => typeof c === 'string').join('') : '';
  return headingId(text) || undefined;
}

/**
 * Renders post bodies.
 *
 * Raw HTML is deliberately not enabled (no `rehype-raw`): post bodies can be
 * written by a connected AI client over MCP, and rendering arbitrary HTML from
 * that source would be a stored-XSS hole. Markdown syntax is all that is needed.
 *
 * Styled from design tokens through the `components` map rather than by a
 * typography plugin. The plugin brought its own type scale, which fought the
 * design system's — two opinions about heading sizes, one of them losing at
 * random depending on selector specificity.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="article-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // An H1 in the body is demoted: the post title is already the page's
          // only H1, and a second one breaks the document outline.
          h1: ({ children: c }) => (
            <h2 id={anchor(c)} className="mb-3 mt-7 text-2xl font-extrabold tracking-[-0.02em]">
              {c}
            </h2>
          ),
          h2: ({ children: c }) => (
            <h2 id={anchor(c)} className="mb-3 mt-7 text-2xl font-extrabold tracking-[-0.02em]">
              {c}
            </h2>
          ),
          h3: ({ children: c }) => (
            <h3 id={anchor(c)} className="mb-2.5 mt-6 text-xl font-extrabold tracking-[-0.02em]">
              {c}
            </h3>
          ),
          p: ({ children: c }) => <p className="mb-[18px]">{c}</p>,
          ul: ({ children: c }) => <ul className="mb-[18px] list-disc pl-5">{c}</ul>,
          ol: ({ children: c }) => <ol className="mb-[18px] list-decimal pl-5">{c}</ol>,
          li: ({ children: c }) => <li className="mb-1">{c}</li>,
          strong: ({ children: c }) => <strong className="font-bold">{c}</strong>,
          hr: () => <hr className="my-7 h-0.5 border-0 bg-[var(--color-divider)]" />,
          table: ({ children: c }) => (
            <div className="mb-[18px] overflow-x-auto">
              <table className="w-full border-collapse text-sm">{c}</table>
            </div>
          ),
          th: ({ children: c }) => (
            <th className="border-b-2 border-[var(--color-divider)] p-2 text-left font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
              {c}
            </th>
          ),
          td: ({ children: c }) => (
            <td className="border-b border-[var(--color-divider)] p-2">{c}</td>
          ),

          /*
           * A blockquote is the takeaway callout: a tinted panel with an accent
           * kicker. The design has no second quotation style, and inventing one
           * would mean authors picking between two things that look alike.
           */
          blockquote: ({ children: c }) => (
            <div className="mb-6 border-2 border-[var(--soft)] bg-[var(--panel)] p-4">
              <p className="mb-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--accent-text)]">
                Takeaway
              </p>
              <div className="[&>p:last-child]:mb-0">{c}</div>
            </div>
          ),

          code: ({ className, children: c, ...rest }) => {
            // react-markdown gives inline code no language class and no newline;
            // a fenced block arrives wrapped in <pre>, handled below.
            const isBlock = /language-/.test(className ?? '');
            if (isBlock) return <code className={className}>{c}</code>;
            return (
              <code
                className="bg-[var(--panel)] px-1 py-0.5 font-[family-name:var(--mono)] text-[0.9em]"
                {...rest}
              >
                {c}
              </code>
            );
          },

          pre: ({ children: c }) => <CodeBlock>{c}</CodeBlock>,

          a: ({ href, children: content }) => {
            const external = Boolean(href && /^https?:\/\//i.test(href));
            return (
              <a
                href={href}
                className="text-[var(--accent-text)] underline underline-offset-[3px]"
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {content}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
