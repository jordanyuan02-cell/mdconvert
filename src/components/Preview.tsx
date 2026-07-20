import { useEffect, useRef, useCallback } from 'react';
import katex from 'katex';
import { renderMarkdown } from '../lib/markdownRenderer';
import { preprocessMarkdown } from '../lib/preprocessMarkdown';
import { renderMermaidToSvg } from '../lib/mermaidRenderer';
import { installDebugLogger, logKatexRender, getDebugEntries, renderDebugOverlay } from '../lib/debugLogger';
import '../styles/preview.css';

// Import KaTeX CSS
import 'katex/dist/katex.min.css';
// Override KaTeX @font-face sources with CDN URLs
// (fallback if CDN is accessible)
import '../styles/katex-font-fix.css';
// Embed all KaTeX fonts as base64 data URLs — bypasses Tauri v2's
// custom protocol MIME type issues for .woff2 files in production builds.
// This is the PRIMARY font source; CDN and local paths are secondary.
import '../styles/katex-base64.css';

// Install global debug error logger once at module level
installDebugLogger();

interface PreviewProps {
  markdown: string;
  onStatsChange?: (stats: {
    charCount: number;
    wordCount: number;
    formulaCount: number;
    tableCount: number;
    mermaidCount: number;
    codeBlockCount: number;
  }) => void;
  onWarningsChange?: (warnings: string[]) => void;
}

export default function Preview({ markdown, onStatsChange, onWarningsChange }: PreviewProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef('');

  // Render markdown content
  const renderContent = useCallback(async () => {
    if (!contentRef.current) return;

    // Preprocess markdown (normalize, extract mermaid, etc.)
    const preprocessed = preprocessMarkdown(markdown);
    onStatsChange?.(preprocessed.stats);
    onWarningsChange?.(preprocessed.warnings);

    // Use the preprocessed markdown for rendering (normalized)
    const html = renderMarkdown(markdown);
    
    // Wrap in .markdown-body so preview CSS styles apply
    contentRef.current.innerHTML = `<div class="markdown-body">${html}</div>`;
    lastHtmlRef.current = html;

    // Get the .markdown-body container for post-processing
    const container = contentRef.current.querySelector('.markdown-body') as HTMLElement;

    // Render KaTeX formulas
    if (container) renderKaTeX(container);

    // Render Mermaid diagrams
    await renderMermaidDiagrams(container || contentRef.current);

    // Render code highlighting
    renderCodeHighlight(contentRef.current);

    // Append debug overlay (visible when errors exist)
    const debugHtml = renderDebugOverlay();
    if (debugHtml) {
      const existing = document.getElementById('debug-overlay');
      if (existing) existing.remove();
      contentRef.current.insertAdjacentHTML('beforeend', debugHtml);
    }
  }, [markdown, onStatsChange, onWarningsChange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      renderContent();
    }, 300); // Debounce 300ms

    return () => clearTimeout(timer);
  }, [renderContent]);

  return (
    <div className="preview-content" ref={contentRef} />
  );
}

/**
 * Minimal KaTeX fallback: handles $...$ / $$...$$ (dollars syntax) that
 * texmath (configured for 'brackets' mode) won't catch.
 * Primary rendering of \(...\) / \[...\] is handled by texmath plugin.
 */
function renderKaTeX(container: HTMLElement) {
  const elements = container.querySelectorAll<HTMLElement>(
    'p, span, li, td, th, div:not(.katex):not(.katex-display)'
  );

  for (const el of elements) {
    if (el.closest('.katex, .katex-display, code, pre')) continue;

    const html = el.innerHTML;
    if (!html.includes('$')) continue;

    let newHtml = html;

    // Display math: $$...$$ → KaTeX
    newHtml = newHtml.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula: string) => {
      try {
        const result = katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false, output: 'html' });
        logKatexRender(true, formula);
        return result;
      } catch (e) {
        logKatexRender(false, formula, String(e));
        return `<span class="katex-error" style="color:red">公式错误: ${formula}</span>`;
      }
    });

    // Inline math: $...$ → KaTeX
    if (newHtml.includes('$')) {
      newHtml = newHtml.replace(/\$(.+?)\$/g, (_, formula: string) => {
        try {
          const result = katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false, output: 'html' });
          logKatexRender(true, formula);
          return result;
        } catch (e) {
          logKatexRender(false, formula, String(e));
          return _;
        }
      });
    }

    if (newHtml !== html) {
      el.innerHTML = newHtml;
    }
  }
}

/**
 * Render Mermaid diagrams
 */
async function renderMermaidDiagrams(container: HTMLElement) {
  const codeBlocks = container.querySelectorAll('pre code.language-mermaid');
  
  for (const codeBlock of codeBlocks) {
    const pre = codeBlock.closest('pre');
    if (!pre) continue;

    const definition = codeBlock.textContent || '';
    if (!definition.trim()) continue;

    // Create mermaid container
    const mermaidDiv = document.createElement('div');
    mermaidDiv.className = 'mermaid-container';

    try {
      const result = await renderMermaidToSvg(definition);
      if (result.success) {
        mermaidDiv.innerHTML = result.svg;
      } else {
        mermaidDiv.innerHTML = `<div class="mermaid-error">Mermaid 渲染失败: ${result.error}</div>`;
      }
    } catch (error) {
      mermaidDiv.innerHTML = `<div class="mermaid-error">Mermaid 渲染失败: ${error}</div>`;
    }

    // Replace the pre element with the mermaid container
    pre.parentNode?.replaceChild(mermaidDiv, pre);
  }
}

/**
 * Render code highlighting (hljs already handles this via markdown-it)
 */
function renderCodeHighlight(container: HTMLElement) {
  // hljs is already integrated in markdown-it, so this is a placeholder
  // for any additional post-processing if needed
}
