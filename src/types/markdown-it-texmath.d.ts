declare module 'markdown-it-texmath' {
  import type MarkdownIt from 'markdown-it';

  interface TexMathOptions {
    engine: {
      renderToString: (tex: string, options?: {
        displayMode?: boolean;
        throwOnError?: boolean;
        output?: string;
      }) => string;
    };
    delimiters?: string | string[];
    katexOptions?: {
      throwOnError?: boolean;
      output?: string;
    };
    macros?: Record<string, string>;
  }

  const texmath: (md: MarkdownIt, options: TexMathOptions) => void;
  export default texmath;
}

// Side-effect import for KaTeX mhchem extension; registers \ce{}, \pu{} macros.
declare module 'katex/contrib/mhchem';
