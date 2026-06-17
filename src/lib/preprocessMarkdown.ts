export interface Asset {
  id: string;
  index: number;
  code: string;
  svgContent?: string;
  pngBase64?: string;
  type: 'mermaid';
}

export interface PreprocessResult {
  markdownForDocx: string;
  markdownForPreview: string;
  assets: Asset[];
  warnings: string[];
  stats: {
    charCount: number;
    wordCount: number;
    formulaCount: number;
    tableCount: number;
    mermaidCount: number;
    codeBlockCount: number;
  };
}

/**
 * Normalize line endings and fix common AI platform copy issues
 */
function normalizeText(raw: string): string {
  let text = raw;
  // Normalize line endings
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\r/g, '\n');
  // Remove BOM
  text = text.replace(/^\uFEFF/, '');
  // Fix multiple consecutive blank lines (max 2)
  text = text.replace(/\n{3,}/g, '\n\n');
  return text;
}

/**
 * Detect Mermaid code blocks and extract them
 */
function extractMermaidBlocks(text: string): { processed: string; assets: Asset[] } {
  const assets: Asset[] = [];
  let index = 0;
  
  const processed = text.replace(/```mermaid\s*\n([\s\S]*?)```/g, (match, code: string) => {
    const id = `diagram-${String(index + 1).padStart(3, '0')}`;
    const asset: Asset = {
      id,
      index,
      code: code.trim(),
      type: 'mermaid',
    };
    assets.push(asset);
    index++;
    // In the markdown, keep the mermaid block for preview
    // For Word export, we'll replace with image reference later
    return match;
  });

  return { processed, assets };
}

/**
 * Count LaTeX formulas in text
 */
function countFormulas(text: string): { count: number; warnings: string[] } {
  const warnings: string[] = [];
  
  // Count inline formulas $...$
  const inlineMatches = text.match(/\$[^\$]+\$/g);
  const inlineCount = inlineMatches ? inlineMatches.length : 0;

  // Count display formulas $$...$$
  const displayMatches = text.match(/\$\$[\s\S]*?\$\$/g);
  const displayCount = displayMatches ? displayMatches.length : 0;

  // Check for unclosed dollar signs
  const dollarCount = (text.match(/\$/g) || []).length;
  if (dollarCount % 2 !== 0) {
    warnings.push('检测到未闭合的 $ 符号，请检查公式语法。');
  }

  // Check for chemical formulas with \ce{}
  if (text.includes('\\ce{')) {
    warnings.push('检测到化学公式 \\ce{}，Word 导出时可能无法正确转换，预览时使用 KaTeX mhchem 渲染。');
  }

  return { count: inlineCount + displayCount, warnings };
}

/**
 * Count tables in markdown
 */
function countTables(text: string): number {
  const tableMatches = text.match(/^\|.+\|$/gm);
  if (!tableMatches) return 0;
  
  // Group consecutive table lines
  let tableCount = 0;
  let inTable = false;
  for (const line of text.split('\n')) {
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      if (!inTable) {
        tableCount++;
        inTable = true;
      }
    } else {
      inTable = false;
    }
  }
  return tableCount;
}

/**
 * Count code blocks
 */
function countCodeBlocks(text: string): number {
  const matches = text.match(/```/g);
  return matches ? Math.floor(matches.length / 2) : 0;
}

/**
 * Count words (Chinese characters + English words)
 */
function countWords(text: string): { charCount: number; wordCount: number } {
  // Count Chinese characters
  const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  
  // Count English words
  const englishWords = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\$[^\$]+\$/g, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0 && /[a-zA-Z]/.test(w));
  
  return {
    charCount: text.length,
    wordCount: chineseChars + englishWords.length,
  };
}

/**
 * Preprocess markdown for preview and export
 */
export function preprocessMarkdown(raw: string): PreprocessResult {
  const warnings: string[] = [];

  // Step 1: Normalize text
  const normalized = normalizeText(raw);

  // Step 2: Extract Mermaid blocks
  const { processed: withMermaid, assets } = extractMermaidBlocks(normalized);

  // Step 3: Build markdown for preview (keep mermaid blocks)
  const markdownForPreview = normalized;

  // Step 4: Build markdown for docx export
  // For docx, replace mermaid blocks with image references
  let markdownForDocx = normalized;
  for (const asset of assets) {
    const mermaidBlock = `\`\`\`mermaid\n${asset.code}\n\`\`\``;
    const imageRef = `![${asset.id}](assets/${asset.id}.svg)`;
    markdownForDocx = markdownForDocx.replace(mermaidBlock, imageRef);
  }

  // Step 5: Count stats
  const formulaResult = countFormulas(normalized);
  warnings.push(...formulaResult.warnings);

  const charWord = countWords(normalized);

  return {
    markdownForDocx,
    markdownForPreview,
    assets,
    warnings,
    stats: {
      charCount: charWord.charCount,
      wordCount: charWord.wordCount,
      formulaCount: formulaResult.count,
      tableCount: countTables(normalized),
      mermaidCount: assets.length,
      codeBlockCount: countCodeBlocks(normalized),
    },
  };
}
