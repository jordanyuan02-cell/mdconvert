import { useState, useCallback, useEffect, useRef } from 'react';
import { open, save, message } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import Editor from './components/Editor';
import Preview from './components/Preview';
import Toolbar from './components/Toolbar';
import SettingsDialog, { loadSettings, type Settings } from './components/SettingsDialog';
import { exportDocx, checkPandoc, getPandocVersion } from './lib/exportDocx';
import { exportPdf, buildPdfHtml } from './lib/exportPdf';

const DEFAULT_MARKDOWN = `# 欢迎使用 Markdown to Word

在这里粘贴从 ChatGPT、DeepSeek、豆包、Claude 等 AI 平台复制的内容。

## 功能特性

- **实时预览**：右侧实时显示渲染效果
- **数学公式**：支持 $E = mc^2$ 行内公式和块级公式
- **表格显示**：支持 Markdown 表格
- **代码高亮**：支持多种编程语言
- **Mermaid 流程图**：支持流程图、时序图等
- **导出 Word**：一键导出为可编辑的 Word 文档
- **导出 PDF**：导出为 PDF 文件

## 数学公式示例

行内公式：$\\alpha + \\beta = \\gamma$

块级公式：

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

## 表格示例

| 项目 | 数值 | 备注 |
|------|------|------|
| 示例 A | 100 | 第一行 |
| 示例 B | 200 | 第二行 |
| 示例 C | 300 | 第三行 |

## 代码示例

\`\`\`python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

print(fibonacci(10))  # 55
\`\`\`

## Mermaid 流程图

\`\`\`mermaid
graph TD
    A[开始] --> B{判断}
    B -->|条件1| C[处理1]
    B -->|条件2| D[处理2]
    C --> E[结束]
    D --> E
\`\`\`

> **提示**：左侧编辑 Markdown，右侧实时预览。点击工具栏按钮导出 Word 或 PDF。
`;

function App() {
  const [markdown, setMarkdown] = useState(() => {
    return localStorage.getItem('md2word-draft') || DEFAULT_MARKDOWN;
  });
  const [stats, setStats] = useState({
    charCount: 0,
    wordCount: 0,
    formulaCount: 0,
    tableCount: 0,
    mermaidCount: 0,
    codeBlockCount: 0,
  });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [pandocAvailable, setPandocAvailable] = useState(false);
  const [pandocVersion, setPandocVersion] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [statusMessage, setStatusMessage] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);

  // Check pandoc availability on mount
  useEffect(() => {
    checkPandoc().then((available) => {
      setPandocAvailable(available);
      if (available) {
        getPandocVersion().then((v) => setPandocVersion(v));
      }
    });
  }, []);

  // Auto-save draft
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('md2word-draft', markdown);
    }, 2000);
    return () => clearTimeout(timer);
  }, [markdown]);

  const handleOpenFile = useCallback(async () => {
    try {
      const filePath = await open({
        multiple: false,
        filters: [{
          name: 'Markdown',
          extensions: ['md', 'markdown', 'txt'],
        }],
      });
      if (filePath) {
        const content = await readTextFile(filePath as string);
        setMarkdown(content);
        setStatusMessage(`已打开: ${filePath}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await message(`打开文件失败: ${msg}`, { kind: 'error' });
    }
  }, []);

  const handleSaveFile = useCallback(async () => {
    try {
      const filePath = await save({
        defaultPath: 'untitled.md',
        filters: [{
          name: 'Markdown',
          extensions: ['md', 'markdown'],
        }],
      });
      if (filePath) {
        await writeTextFile(filePath as string, markdown);
        setStatusMessage(`已保存: ${filePath}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await message(`保存文件失败: ${msg}`, { kind: 'error' });
    }
  }, [markdown]);

  const handleExportDocx = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setStatusMessage('正在导出 Word...');

    try {
      const result = await exportDocx({
        markdown,
        enableMermaid: settings.enableMermaid,
        enableToc: settings.enableToc,
        autoOpen: settings.autoOpen,
        marginTop: settings.marginTop,
        marginBottom: settings.marginBottom,
        marginLeft: settings.marginLeft,
        marginRight: settings.marginRight,
        pageSize: settings.pageSize,
      });

      if (result.success) {
        setStatusMessage(`✅ ${result.message}`);
        setWarnings(result.warnings);
      } else {
        setStatusMessage(`❌ ${result.message}`);
        await message(result.message, { kind: 'error' });
      }

      if (result.warnings.length > 0) {
        setWarnings((prev) => [...prev, ...result.warnings]);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setStatusMessage(`❌ 导出失败`);
      await message(`导出失败: ${msg}`, { kind: 'error' });
    } finally {
      setExporting(false);
    }
  }, [markdown, settings, exporting]);

  const handleExportPdf = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setStatusMessage('正在导出 PDF...');

    try {
      const result = await exportPdf(markdown, undefined, {
        pageSize: settings.pageSize,
        marginTop: settings.marginTop,
        marginBottom: settings.marginBottom,
        marginLeft: settings.marginLeft,
        marginRight: settings.marginRight,
      });

      if (result.success) {
        setStatusMessage(`✅ ${result.message}`);
      } else {
        setStatusMessage(`❌ ${result.message}`);
        await message(result.message, { kind: 'error' });
      }

      if (result.warnings.length > 0) {
        setWarnings(result.warnings);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setStatusMessage(`❌ 导出失败`);
      await message(`导出失败: ${msg}`, { kind: 'error' });
    } finally {
      setExporting(false);
    }
  }, [markdown, settings, exporting]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setMarkdown(text);
        setStatusMessage(`✅ 已从剪贴板粘贴 (${text.length} 字符)`);
      } else {
        setStatusMessage('⚠️ 剪贴板为空');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setStatusMessage(`❌ 读取剪贴板失败: ${msg}`);
      await message(`读取剪贴板失败: ${msg}\n\n请确保允许剪贴板访问权限。`, { kind: 'error' });
    }
  }, []);


  const handleCopyHtml = useCallback(async () => {
    try {
      const html = buildPdfHtml(markdown, { markdown, pageSize: settings.pageSize });
      await navigator.clipboard.writeText(html);
      setStatusMessage('✅ HTML 已复制到剪贴板');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setStatusMessage(`❌ 复制失败: ${msg}`);
    }
  }, [markdown, settings]);

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleSettingsChange = useCallback((newSettings: Settings) => {
    setSettings(newSettings);
  }, []);

  return (
    <div className="app-container">
      <Toolbar
        onOpenFile={handleOpenFile}
        onSaveFile={handleSaveFile}
        onPasteFromClipboard={handlePasteFromClipboard}
        onExportDocx={handleExportDocx}
        onExportPdf={handleExportPdf}
        onCopyHtml={handleCopyHtml}
        onOpenSettings={handleOpenSettings}
        exporting={exporting}
        pandocAvailable={pandocAvailable}
        pandocVersion={pandocVersion}
      />

      <div className="main-content">
        <div className="editor-pane">
          <div className="pane-header">
            <span>📝 Markdown 编辑</span>
          </div>
          <Editor
            value={markdown}
            onChange={setMarkdown}
          />
        </div>

        <div className="preview-pane" ref={previewRef}>
          <div className="pane-header">
            <span>👁️ 实时预览</span>
            <span className="stats">
              <span>📊 {stats.wordCount} 字</span>
              <span>📐 {stats.formulaCount} 公式</span>
              <span>📋 {stats.tableCount} 表格</span>
              <span>🔷 {stats.mermaidCount} 图</span>
            </span>
          </div>
          <Preview
            markdown={markdown}
            onStatsChange={setStats}
            onWarningsChange={setWarnings}
          />
        </div>
      </div>

      <div className="statusbar">
        <span className="status-item">
          字数: {stats.charCount} | {stats.wordCount} 词
        </span>
        <span className="status-item">
          公式: {stats.formulaCount}
        </span>
        <span className="status-item">
          表格: {stats.tableCount}
        </span>
        <span className="status-item">
          Mermaid: {stats.mermaidCount}
        </span>
        <span className="status-item">
          代码块: {stats.codeBlockCount}
        </span>
        {statusMessage && (
          <span className={`status-item ${statusMessage.includes('✅') ? 'success' : statusMessage.includes('❌') ? 'error' : ''}`}>
            {statusMessage}
          </span>
        )}
        {warnings.length > 0 && (
          <span className="status-item error" title={warnings.join('\n')}>
            ⚠️ {warnings.length} 个警告
          </span>
        )}
      </div>

      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onSettingsChange={handleSettingsChange}
      />
    </div>
  );
}

export default App;
