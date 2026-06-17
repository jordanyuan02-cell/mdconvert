import mermaid from 'mermaid';

let initialized = false;

function initMermaid() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    fontFamily: 'sans-serif',
    themeVariables: {
      fontFamily: 'sans-serif',
    },
  });
  initialized = true;
}

export interface MermaidRenderResult {
  svg: string;
  success: boolean;
  error?: string;
}

/**
 * Render a Mermaid diagram definition to SVG string
 */
export async function renderMermaidToSvg(definition: string): Promise<MermaidRenderResult> {
  try {
    initMermaid();
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const { svg } = await mermaid.render(id, definition);
    return { svg, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      svg: `<div class="mermaid-error">Mermaid 渲染失败: ${errorMessage}</div>`,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Convert SVG string to PNG data URL
 */
export function svgToPngDataUrl(svg: string, width: number = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas 2D context not available'));
      return;
    }

    const img = new Image();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const scale = width / img.width;
      canvas.width = width;
      canvas.height = img.height * scale;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG image load failed'));
    };

    img.src = url;
  });
}
