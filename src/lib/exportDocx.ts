import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { preprocessMarkdown } from './preprocessMarkdown';
import { renderMermaidToSvg } from './mermaidRenderer';
import { getMarkdownRenderer } from './markdownRenderer';

export interface ExportDocxOptions {
  markdown: string;
  outputPath?: string;
  pageSize?: string;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  enableMermaid?: boolean;
  enableToc?: boolean;
  autoOpen?: boolean;
}

export interface ExportDocxResult {
  success: boolean;
  outputPath?: string;
  warnings: string[];
  message: string;
}

/**
 * Check if Pandoc is available on the system
 */
export async function checkPandoc(): Promise<boolean> {
  try {
    return await invoke<boolean>('check_pandoc');
  } catch {
    return false;
  }
}

/**
 * Get Pandoc version string
 */
export async function getPandocVersion(): Promise<string> {
  return await invoke<string>('get_pandoc_version');
}

/**
 * Export markdown to Word document using Pandoc via Tauri backend.
 * Handles pre-processing (mermaid rendering, markdown-to-HTML) before passing to Pandoc.
 */
export async function exportDocx(options: ExportDocxOptions): Promise<ExportDocxResult> {
  const warnings: string[] = [];

  try {
    // 1. Preprocess the markdown
    const preprocessed = preprocessMarkdown(options.markdown);
    warnings.push(...preprocessed.warnings);

    // 2. If mermaid is enabled, render mermaid diagrams
    let markdownForExport = preprocessed.markdownForDocx;
    const assets = preprocessed.assets;

    if (options.enableMermaid !== false && assets.length > 0) {
      for (const asset of assets) {
        const result = await renderMermaidToSvg(asset.code);
        if (result.success) {
          asset.svgContent = result.svg;
        } else {
          warnings.push(`Mermaid 图 ${asset.id} 渲染失败: ${result.error}`);
        }
      }
      for (const asset of assets) {
        const mermaidBlock = `\`\`\`mermaid\n${asset.code}\n\`\`\``;
        const imageRef = `![${asset.id}](assets/${asset.id}.svg)`;
        markdownForExport = markdownForExport.replace(mermaidBlock, imageRef);
      }
    }

    // 3. Determine output path
    const outputPath = options.outputPath || await save({
      defaultPath: 'output.docx',
      filters: [{ name: 'Word 文档', extensions: ['docx'] }],
    });

    if (!outputPath) {
      return { success: false, warnings, message: '用户取消了导出操作。' };
    }

    // 4. Build settings for Rust backend
    const settings = {
      page_size: options.pageSize || 'A4',
      margin_top: options.marginTop ?? 25,
      margin_bottom: options.marginBottom ?? 25,
      margin_left: options.marginLeft ?? 25,
      margin_right: options.marginRight ?? 25,
      enable_mermaid: options.enableMermaid !== false,
      enable_code_highlight: true,
      enable_toc: options.enableToc === true,
      auto_open: options.autoOpen === true,
    };

    // 5. Call Tauri backend (Pandoc)
    const result = await invoke<ExportDocxResult>('export_docx', {
      markdown: markdownForExport,
      outputPath,
      settings,
    });

    return {
      success: result.success,
      outputPath: result.outputPath || outputPath,
      warnings: [...warnings, ...(result.warnings || [])],
      message: result.message,
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
