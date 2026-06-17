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
    delimiters?: 'dollars' | 'brackets' | 'gitlab' | 'julia';
    katexOptions?: {
      throwOnError?: boolean;
      output?: string;
    };
    macros?: Record<string, string>;
  }

  const texmath: (md: MarkdownIt, options: TexMathOptions) => void;
  export default texmath;
}
