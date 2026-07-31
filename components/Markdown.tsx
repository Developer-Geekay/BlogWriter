import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders post bodies.
 *
 * Raw HTML is deliberately not enabled (no `rehype-raw`): post bodies can be
 * written by a connected AI client over MCP, and rendering arbitrary HTML from
 * that source would be a stored-XSS hole. Markdown syntax is all that is needed.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="article-body prose prose-neutral max-w-none dark:prose-invert prose-headings:font-sans prose-a:text-[var(--color-accent)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: content }) => {
            const external = Boolean(href && /^https?:\/\//i.test(href));
            return (
              <a
                href={href}
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
