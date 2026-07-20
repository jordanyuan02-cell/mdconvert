import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
// Load mhchem extension to register \ce{}, \pu{} macros with KaTeX
import 'katex/contrib/mhchem';

let mdInstance: MarkdownIt | null = null;

export function getMarkdownRenderer(): MarkdownIt {
  if (mdInstance) return mdInstance;

  mdInstance = new MarkdownIt({
    html: true,
    breaks: true,
    linkify: true,
    typographer: true,
    highlight: (str: string, lang: string) => {
      if (lang && hljs.getLanguage(lang)) {
        try {
          const highlighted = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
          return `<pre class="hljs"><code>${highlighted}</code></pre>`;
        } catch {}
      }
      return `<pre class="hljs"><code>${mdInstance!.utils.escapeHtml(str)}</code></pre>`;
    },
  })
  // Integrate KaTeX via markdown-it-texmath — renders $...$, $$...$$, \(...\), and \[...\]
  .use(texmath, {
    engine: katex,
    delimiters: ['dollars', 'brackets'],
    katexOptions: {
      throwOnError: false,
      output: 'html',
    },
  });

  // Enhance table rendering
  const defaultRenderer = mdInstance.renderer.rules.table_open || ((tokens, idx, options, env, self) => {
    return self.renderToken(tokens, idx, options);
  });

  mdInstance.renderer.rules.table_open = (tokens, idx, options, env, self) => {
    return '<div class="table-wrapper">\n' + defaultRenderer(tokens, idx, options, env, self);
  };

  mdInstance.renderer.rules.table_close = (tokens, idx, options, env, self) => {
    return '</table>\n</div>\n';
  };

  return mdInstance;
}

export function renderMarkdown(markdown: string): string {
  const md = getMarkdownRenderer();
  return md.render(markdown);
}

export function renderMarkdownInline(markdown: string): string {
  const md = getMarkdownRenderer();
  return md.renderInline(markdown);
}
