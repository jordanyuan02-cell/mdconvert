import { useRef, useCallback } from 'react';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function Editor({ value, onChange }: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={handleChange}
      spellCheck={false}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        outline: 'none',
        resize: 'none',
        padding: '12px 16px',
        fontFamily: "'Consolas', 'Courier New', monospace",
        fontSize: '14px',
        lineHeight: '1.6',
        color: '#333',
        backgroundColor: '#ffffff',
        overflow: 'auto',
      }}
    />
  );
}
