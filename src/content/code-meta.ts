import { visit } from 'unist-util-visit';
import type { Element, Root } from 'hast';

/**
 * Splits our `lang:filename` fence convention apart before highlighting runs.
 *
 * Authors write ```` ```go:worker.go ```` to put a filename on the block's
 * label bar. Markdown turns the whole info string into one class —
 * `language-go:worker.go` — which highlight.js reads as a language it has never
 * heard of, so the block comes back unhighlighted exactly when the author took
 * the trouble to label it.
 *
 * This rewrites the class to `language-go` and moves the filename to a data
 * attribute. It must run *before* rehype-highlight, which is why it is a
 * separate plugin rather than something CodeBlock does at render time: by then
 * highlighting has already happened or already failed.
 */
export function rehypeCodeMeta() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'code') return;

      const classes = node.properties?.['className'];
      if (!Array.isArray(classes)) return;

      const index = classes.findIndex(
        (c) => typeof c === 'string' && c.startsWith('language-') && c.includes(':'),
      );
      if (index === -1) return;

      const info = String(classes[index]).slice('language-'.length);
      const [language, ...rest] = info.split(':');
      const filename = rest.join(':').trim();

      // An empty language (```` ```:worker.go ````) leaves the block
      // unhighlighted rather than guessing, but still gets its label.
      classes[index] = language ? `language-${language}` : 'language-plaintext';
      if (filename) {
        node.properties = { ...node.properties, 'data-filename': filename };
      }
    });
  };
}
