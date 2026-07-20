import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { renderMarkdown } from './markdownRenderer';
import katexCssRaw from 'katex/dist/katex.min.css?raw';

/** Version of KaTeX being used — must match what's in node_modules */
const KATEX_VERSION = '0.16.47';
/** Base CDN URL for KaTeX fonts */
const KATEX_FONTS_CDN = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/fonts/`;

/**
 * Inline-friendly KaTeX CSS with absolute font URLs (CDN).
 * Vite's `?raw` import returns the file content as-is without URL rewriting,
 * so we replace relative `url(fonts/...)` with absolute CDN URLs.
 */
const katexCssInline = katexCssRaw.replace(/url\(fonts\//g, `url(${KATEX_FONTS_CDN}`);

export interface ExportPdfOptions {
  markdown: string;
  htmlContent?: string;
  /** Optional: pre-set output path to skip the save dialog */
  outputPath?: string;
  pageSize?: string;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
}

export interface ExportPdfResult {
  success: boolean;
  outputPath?: string;
  warnings: string[];
  message: string;
}

/**
 * Build complete HTML document from markdown content for browser printing
 */
export function buildPdfHtml(
  markdown: string,
  options: ExportPdfOptions
): string {
  const renderedHtml = options.htmlContent || renderMarkdown(markdown);

  const marginTop = options.marginTop ?? 25;
  const marginBottom = options.marginBottom ?? 25;
  const marginLeft = options.marginLeft ?? 25;
  const marginRight = options.marginRight ?? 25;
  const pageSize = options.pageSize || 'A4';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Markdown Export</title>
<style>
@page {
  size: ${pageSize};
  margin: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm;
}

* {
  box-sizing: border-box;
}

body {
  font-family: 'Times New Roman', '宋体', SimSun, serif;
  font-size: 12pt;
  line-height: 1.6;
  color: #333;
  padding: 0;
  margin: 0;
}

.markdown-body {
  max-width: 100%;
  padding: 0;
}

.markdown-body h1 {
  font-size: 22pt;
  font-weight: bold;
  margin-top: 24pt;
  margin-bottom: 12pt;
  page-break-after: avoid;
  border-bottom: 1px solid #eee;
  padding-bottom: 6pt;
}

.markdown-body h2 {
  font-size: 18pt;
  font-weight: bold;
  margin-top: 18pt;
  margin-bottom: 9pt;
  page-break-after: avoid;
}

.markdown-body h3 {
  font-size: 15pt;
  font-weight: bold;
  margin-top: 15pt;
  margin-bottom: 8pt;
  page-break-after: avoid;
}

.markdown-body h4 {
  font-size: 13pt;
  font-weight: bold;
  margin-top: 12pt;
  margin-bottom: 6pt;
}

.markdown-body p {
  margin-bottom: 6pt;
  text-align: justify;
}

.markdown-body table {
  border-collapse: collapse;
  width: 100%;
  margin: 12pt 0;
  page-break-inside: avoid;
}

.markdown-body th, .markdown-body td {
  border: 1px solid #333;
  padding: 6pt 8pt;
  text-align: left;
  vertical-align: top;
}

.markdown-body th {
  background-color: #f0f0f0;
  font-weight: bold;
}

.markdown-body .table-wrapper {
  overflow-x: auto;
}

.markdown-body pre {
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 10pt;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 10pt;
  line-height: 1.4;
  overflow-x: auto;
  page-break-inside: avoid;
}

.markdown-body code {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 10pt;
  background-color: #f5f5f5;
  padding: 1pt 3pt;
  border-radius: 3px;
}

.markdown-body pre code {
  padding: 0;
  background: none;
  border: none;
}

.markdown-body blockquote {
  border-left: 4px solid #ccc;
  margin: 12pt 0;
  padding: 6pt 15pt;
  color: #666;
  background: #fafafa;
}

.markdown-body ul, .markdown-body ol {
  margin-bottom: 6pt;
  padding-left: 24pt;
}

.markdown-body li {
  margin-bottom: 3pt;
}

.markdown-body img {
  max-width: 100%;
  height: auto;
}

.markdown-body hr {
  border: none;
  border-top: 1px solid #ddd;
  margin: 20pt 0;
}

.markdown-body a {
  color: #1677ff;
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.katex {
  font-size: 1.1em;
}

.katex-display {
  margin: 12pt 0;
  page-break-inside: avoid;
  overflow-x: auto;
  overflow-y: hidden;
}

.mermaid-container {
  text-align: center;
  margin: 12pt 0;
  page-break-inside: avoid;
}

.mermaid-container svg {
  max-width: 100%;
  height: auto;
}

/* Task list styling */
.markdown-body input[type="checkbox"] {
  margin-right: 4pt;
}

/* Code highlight overrides for print */
.hljs {
  background: transparent !important;
}

@media print {
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
<!-- KaTeX CSS — 内联样式（使用 ?raw 导入 + 字体 URL 重写为绝对 CDN 路径），
     避免无头浏览器从 file:// URL 加载 CDN 外部样式表失败的问题 -->
<style>${katexCssInline}</style>
</head>
<body>
<div class="markdown-body">
${renderedHtml}
</div>
</body>
</html>`;
}

/**
 * Export markdown to PDF via browser print.
 * Generates a full HTML document with print CSS, saves it to disk via Rust backend,
 * and opens it in the default browser for the user to print as PDF.
 */
export async function exportPdf(
  markdown: string,
  htmlContent?: string,
  options?: Partial<ExportPdfOptions>
): Promise<ExportPdfResult> {
  const warnings: string[] = [];

  try {
    const fullOptions: ExportPdfOptions = {
      markdown,
      htmlContent,
      pageSize: options?.pageSize || 'A4',
      marginTop: options?.marginTop ?? 25,
      marginBottom: options?.marginBottom ?? 25,
      marginLeft: options?.marginLeft ?? 25,
      marginRight: options?.marginRight ?? 25,
    };

    // Build complete HTML with print CSS
    const fullHtml = buildPdfHtml(markdown, fullOptions);

    // Determine output path (show save dialog if not pre-set)
    const outputPath = options?.outputPath || await save({
      defaultPath: 'output.pdf',
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
    });

    if (!outputPath) {
      return { success: false, warnings, message: '用户取消了导出操作。' };
    }

    // Call Tauri backend to print HTML to PDF via Edge/Chrome headless
    await invoke('export_pdf_with_edge', {
      htmlContent: fullHtml,
      outputPath,
    });
    return {
      success: true,
      outputPath,
      warnings,
      message: 'PDF 导出成功！',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      warnings,
      message: `导出失败: ${errorMessage}`,
    };
  }
}
