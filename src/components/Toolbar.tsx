interface ToolbarProps {
  onOpenFile: () => void;
  onSaveFile: () => void;
  onPasteFromClipboard: () => void;
  onExportDocx: () => void;
  onExportPdf: () => void;
  onCopyHtml: () => void;
  onOpenSettings: () => void;
  exporting: boolean;
  pandocAvailable: boolean;
  pandocVersion: string;
}

export default function Toolbar({
  onOpenFile,
  onSaveFile,
  onPasteFromClipboard,
  onExportDocx,
  onExportPdf,
  onCopyHtml,
  onOpenSettings,
  exporting,
  pandocAvailable,
  pandocVersion,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <span className="app-title">📄 Markdown 转换程序</span>

      <div className="separator" />

      {/* 输入方式区域 */}
      <button onClick={onPasteFromClipboard} title="从剪贴板粘贴 Markdown 文本">
        📋 从剪贴板粘贴
      </button>
      <button onClick={onOpenFile} title="打开本地 Markdown 文件">
        📂 打开文件
      </button>
      <div className="separator" />

      <button onClick={onSaveFile} title="保存为 Markdown 文件">
        💾 保存
      </button>

      <div className="separator" />

      <button
        className="primary"
        onClick={onExportDocx}
        disabled={exporting || !pandocAvailable}
        title={!pandocAvailable ? '需要安装 Pandoc' : '导出为 Word 文档'}
      >
        {exporting ? '⏳ 导出中...' : '📝 导出 Word'}
      </button>
      <button
        onClick={onExportPdf}
        disabled={exporting}
        title="导出为 PDF"
      >
        📕 导出 PDF
      </button>

      <div className="separator" />

      <button onClick={onCopyHtml} title="复制 HTML 到剪贴板">
        📋 复制 HTML
      </button>

      <div className="spacer" />

      <button onClick={onOpenSettings} title="设置">
        ⚙️ 设置
      </button>

      <div className="separator" />

      <span style={{ fontSize: '11px', color: '#999' }}>
        {pandocAvailable
          ? `✅ ${pandocVersion}`
          : '❌ Pandoc 未安装'}
      </span>
    </div>
  );
}
