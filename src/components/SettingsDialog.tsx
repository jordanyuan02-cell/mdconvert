import { useState } from 'react';

interface Settings {
  referenceDocx: string;
  pageSize: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  enableMermaid: boolean;
  enableCodeHighlight: boolean;
  enableToc: boolean;
  autoOpen: boolean;
  fontSize: number;
  theme: 'light' | 'dark';
}

const defaultSettings: Settings = {
  referenceDocx: '',
  pageSize: 'A4',
  marginTop: 25,
  marginBottom: 25,
  marginLeft: 25,
  marginRight: 25,
  enableMermaid: true,
  enableCodeHighlight: true,
  enableToc: false,
  autoOpen: true,
  fontSize: 14,
  theme: 'dark',
};

function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem('md2word-settings');
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  } catch {}
  return defaultSettings;
}

function saveSettings(settings: Settings) {
  localStorage.setItem('md2word-settings', JSON.stringify(settings));
}

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: Settings) => void;
}

export default function SettingsDialog({ open, onClose, onSettingsChange }: SettingsDialogProps) {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  if (!open) return null;

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveSettings(newSettings);
    onSettingsChange?.(newSettings);
  };

  const pageSizes = ['A4', 'A3', 'A5', 'Letter', 'Legal'];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>⚙️ 设置</h2>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Page Size */}
          <div>
            <label style={{ fontWeight: 500, display: 'block', marginBottom: '4px' }}>
              页面大小
            </label>
            <select
              value={settings.pageSize}
              onChange={(e) => updateSetting('pageSize', e.target.value)}
              style={selectStyle}
            >
              {pageSizes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Margins */}
          <div>
            <label style={{ fontWeight: 500, display: 'block', marginBottom: '4px' }}>
              页边距 (mm)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <span style={{ fontSize: '12px', color: '#666' }}>上</span>
                <input
                  type="number"
                  value={settings.marginTop}
                  onChange={(e) => updateSetting('marginTop', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div>
                <span style={{ fontSize: '12px', color: '#666' }}>下</span>
                <input
                  type="number"
                  value={settings.marginBottom}
                  onChange={(e) => updateSetting('marginBottom', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div>
                <span style={{ fontSize: '12px', color: '#666' }}>左</span>
                <input
                  type="number"
                  value={settings.marginLeft}
                  onChange={(e) => updateSetting('marginLeft', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div>
                <span style={{ fontSize: '12px', color: '#666' }}>右</span>
                <input
                  type="number"
                  value={settings.marginRight}
                  onChange={(e) => updateSetting('marginRight', Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Editor Font Size */}
          <div>
            <label style={{ fontWeight: 500, display: 'block', marginBottom: '4px' }}>
              编辑器字号
            </label>
            <input
              type="number"
              value={settings.fontSize}
              onChange={(e) => updateSetting('fontSize', Number(e.target.value))}
              min={10}
              max={24}
              style={inputStyle}
            />
          </div>

          {/* Toggles */}
          <div>
            {[
              { key: 'enableMermaid' as const, label: '启用 Mermaid 流程图' },
              { key: 'enableCodeHighlight' as const, label: '启用代码高亮' },
              { key: 'enableToc' as const, label: '导出时包含目录' },
              { key: 'autoOpen' as const, label: '导出后自动打开文件' },
            ].map(({ key, label }) => (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 0',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) => updateSetting(key, e.target.checked)}
                  style={{ width: '16px', height: '16px' }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 24px',
              background: '#1677ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #d0d0d0',
  borderRadius: '4px',
  fontSize: '14px',
  marginTop: '2px',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  background: 'white',
};

// Export the settings type and loader
export type { Settings };
export { loadSettings, saveSettings, defaultSettings };
