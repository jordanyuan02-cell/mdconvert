use std::fs;
use std::path::PathBuf;
use std::process::Command;
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportSettings {
    pub reference_docx: Option<String>,
    pub page_size: String,
    pub margin_top: f64,
    pub margin_bottom: f64,
    pub margin_left: f64,
    pub margin_right: f64,
    pub enable_mermaid: bool,
    pub enable_code_highlight: bool,
    pub enable_toc: bool,
    pub auto_open: bool,
}

impl Default for ExportSettings {
    fn default() -> Self {
        Self {
            reference_docx: None,
            page_size: "A4".to_string(),
            margin_top: 25.0,
            margin_bottom: 25.0,
            margin_left: 25.0,
            margin_right: 25.0,
            enable_mermaid: true,
            enable_code_highlight: true,
            enable_toc: false,
            auto_open: true,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportResult {
    pub success: bool,
    pub output_path: String,
    pub warnings: Vec<String>,
    pub message: String,
}

/// Find Edge or Chrome browser for headless PDF printing.
fn find_edge_or_chrome() -> Option<PathBuf> {
    let candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ];

    for p in &candidates {
        let path = PathBuf::from(p);
        if path.exists() {
            return Some(path);
        }
    }

    // Fallback: use `where.exe` via cmd.exe (searches PATH + App Paths registry)
    for name in &["msedge.exe", "chrome.exe"] {
        if let Some(path) = find_via_where(name) {
            return Some(path);
        }
    }

    None
}

/// Find pandoc executable — checks bundled resource first, then PATH, then common install locations
fn find_pandoc() -> Option<PathBuf> {
    // Priority 1: Find bundled pandoc.exe shipped with the app
    if let Some(bundled) = find_bundled_pandoc() {
        return Some(bundled);
    }

    // Priority 2: Search system PATH
    if let Ok(path) = std::env::var("PATH") {
        for p in std::env::split_paths(&path) {
            let candidate = p.join("pandoc.exe");
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    // Priority 3: Common install directories
    let common_paths = vec![
        // User-local install (Pandoc official installer default)
        std::env::var("LOCALAPPDATA")
            .map(|la| PathBuf::from(la).join("Pandoc").join("pandoc.exe"))
            .ok(),
        // Program Files installs
        Some(PathBuf::from(r"C:\Program Files\Pandoc\pandoc.exe")),
        Some(PathBuf::from(r"C:\Program Files (x86)\Pandoc\pandoc.exe")),
        // Chocolatey install
        Some(PathBuf::from(r"C:\ProgramData\chocolatey\bin\pandoc.exe")),
    ];

    for path_opt in common_paths {
        if let Some(path) = path_opt {
            if path.exists() {
                return Some(path);
            }
        }
    }

    // Priority 4: Ultimate fallback — use `where.exe pandoc` via cmd.exe
    if let Some(path) = find_via_where("pandoc.exe") {
        return Some(path);
    }

    None
}

/// Look for pandoc.exe bundled inside the application's resources directory.
fn find_bundled_pandoc() -> Option<PathBuf> {
    let exe_path = std::env::current_exe().ok()?;
    let exe_dir = exe_path.parent()?;

    let candidates = [
        exe_dir.join("resources").join("bin").join("pandoc.exe"),
        exe_dir.join("resources").join("pandoc.exe"),
        exe_dir.join("bin").join("pandoc.exe"),
        exe_dir.join("pandoc.exe"),
        exe_dir.join("../../resources/bin/pandoc.exe"),
        exe_dir.join("../../resources/pandoc.exe"),
    ];

    for c in &candidates {
        if c.exists() {
            return Some(c.clone());
        }
    }

    None
}

/// Use `cmd.exe /c where.exe <name>` to locate an executable.
fn find_via_where(exec_name: &str) -> Option<PathBuf> {
    let result = Command::new("cmd")
        .args(["/c", "where", exec_name])
        .output()
        .ok()?;
    if !result.status.success() {
        return None;
    }
    let output = String::from_utf8_lossy(&result.stdout);
    let first_line = output.lines().next()?.trim();
    if first_line.is_empty() {
        return None;
    }
    let path = PathBuf::from(first_line);
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

#[tauri::command]
async fn export_docx(
    markdown: String,
    output_path: String,
    settings: Option<ExportSettings>,
) -> Result<ExportResult, String> {
    let settings = settings.unwrap_or_default();
    let mut warnings: Vec<String> = Vec::new();

    // Find pandoc
    let pandoc_path = find_pandoc()
        .ok_or_else(|| "Pandoc 未找到。请安装 Pandoc (https://pandoc.org)。".to_string())?;

    // Create temp directory
    let temp_dir = std::env::temp_dir().join(format!("md2word_{}", chrono_now()));
    fs::create_dir_all(&temp_dir).map_err(|e| format!("无法创建临时目录: {}", e))?;

    // Write the markdown to temp file
    let input_md_path = temp_dir.join("input.md");
    fs::write(&input_md_path, &markdown).map_err(|e| format!("无法写入输入文件: {}", e))?;

    // Build pandoc command
    let mut cmd = Command::new(&pandoc_path);
    cmd.arg(input_md_path.to_str().unwrap())
        .arg("-f")
        .arg("markdown+tex_math_dollars+tex_math_single_backslash+pipe_tables+multiline_tables+fenced_code_blocks+task_lists+grid_tables")
        .arg("-t")
        .arg("docx")
        .arg("-s")
        .arg("--resource-path=.")
        .arg("-o")
        .arg(&output_path);

    if settings.enable_toc {
        cmd.arg("--toc");
    }

    // Execute pandoc
    let result = cmd.output().map_err(|e| format!("Pandoc 执行失败: {}", e))?;

    // Clean up temp directory
    fs::remove_dir_all(&temp_dir).ok();

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        let error_msg = if stderr.contains("could not find data file") {
            "Pandoc 数据文件缺失，请重新安装 Pandoc。".to_string()
        } else if stderr.contains("Unknown option") {
            format!("Pandoc 参数错误: {}", stderr)
        } else {
            format!("Pandoc 转换失败: {}", stderr)
        };
        return Err(error_msg);
    }

    // Check if output file exists
    if !std::path::Path::new(&output_path).exists() {
        return Err("输出文件未生成，请检查 Pandoc 配置。".to_string());
    }

    let stdout = String::from_utf8_lossy(&result.stdout);
    if !stdout.is_empty() {
        warnings.push(stdout.to_string());
    }

    Ok(ExportResult {
        success: true,
        output_path: output_path.clone(),
        warnings,
        message: "Word 文档导出成功！".to_string(),
    })
}

/// Minimal stable PDF export via Edge/Chrome headless.
/// Writes HTML to a file under app cache dir, converts to file:// URL
/// using url::Url::from_file_path(), waits for browser to finish,
/// and validates the output PDF content.
#[tauri::command]
async fn export_pdf_with_edge(
    app_handle: tauri::AppHandle,
    html_content: String,
    output_path: String,
) -> Result<(), String> {
    // ── Find browser ──────────────────────────────────────────────────
    let browser_path = find_edge_or_chrome()
        .ok_or_else(|| "未找到 Microsoft Edge 或 Google Chrome 浏览器，请安装后重试。".to_string())?;

    // ── Create working directory under app cache ─────────────────────
    // Using app_cache_dir() avoids system Temp directory which may have
    // permissions or path-length issues on some Windows configurations.
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| format!("无法获取应用缓存目录: {}", e))?;

    let work_dir = cache_dir.join(format!("md2pdf_{}", chrono_now()));
    std::fs::create_dir_all(&work_dir)
        .map_err(|e| format!("无法创建 PDF 临时目录: {}", e))?;

    // ── Build full HTML document ─────────────────────────────────────
    let full_html = format!(
        r#"<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>PDF Export</title>
<style>
@page {{
  size: A4;
  margin: 25mm;
}}
body {{
  font-family: "Microsoft YaHei", "SimSun", "Times New Roman", serif;
  line-height: 1.6;
  font-size: 12pt;
}}
table {{
  border-collapse: collapse;
  width: 100%;
}}
td, th {{
  border: 1px solid #333;
  padding: 6px;
}}
pre {{
  white-space: pre-wrap;
  background: #f5f5f5;
  padding: 10px;
}}
</style>
</head>
<body>
{}
</body>
</html>"#,
        html_content
    );

    // ── Write HTML to file ───────────────────────────────────────────
    let html_path = work_dir.join("input.html");
    std::fs::write(&html_path, &full_html)
        .map_err(|e| format!("写入 HTML 失败: {}", e))?;

    // ── Verify HTML file exists and has content ──────────────────────
    if !html_path.exists() {
        return Err(format!("严重错误：HTML 文件不存在：{}", html_path.display()));
    }

    let html_size = std::fs::metadata(&html_path)
        .map_err(|e| format!("读取 HTML metadata 失败: {}", e))?
        .len();

    if html_size < 100 {
        return Err(format!(
            "严重错误：HTML 文件过小，可能没有写入成功：{}，大小：{} bytes",
            html_path.display(),
            html_size
        ));
    }

    // ── Convert to file:// URL ───────────────────────────────────────
    // url::Url::from_file_path() handles backslash conversion,
    // percent-encoding of non-ASCII characters (Chinese, spaces, etc.),
    // and produces a correct file:/// URL.
    let file_url = url::Url::from_file_path(&html_path)
        .map_err(|_| format!("无法转换 file URL: {}", html_path.display()))?
        .to_string();

    // ── Debug logging ────────────────────────────────────────────────
    eprintln!("PDF debug: html_path={}", html_path.display());
    eprintln!("PDF debug: html_exists={}", html_path.exists());
    eprintln!("PDF debug: html_size={}", html_size);
    eprintln!("PDF debug: file_url={}", file_url);
    eprintln!("PDF debug: output_path={}", output_path);
    eprintln!("PDF debug: browser_path={}", browser_path.display());

    // ── Execute browser headless PDF printing — WAIT for completion ──
    let output = Command::new(&browser_path)
        .arg("--headless=new")
        .arg("--disable-gpu")
        .arg("--no-first-run")
        .arg("--disable-extensions")
        .arg("--allow-file-access-from-files")
        .arg(format!("--print-to-pdf={}", output_path))
        .arg(&file_url)
        .output()
        .map_err(|e| format!("浏览器打印 PDF 执行失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        return Err(format!(
            "浏览器打印 PDF 失败。\nstdout:\n{}\nstderr:\n{}",
            stdout, stderr
        ));
    }

    // ── Verify output PDF exists ─────────────────────────────────────
    if !std::path::Path::new(&output_path).exists() {
        return Err(format!("PDF 未生成: {}", output_path));
    }

    // ── Verify output PDF has content ────────────────────────────────
    let pdf_size = std::fs::metadata(&output_path)
        .map_err(|e| format!("读取 PDF metadata 失败: {}", e))?
        .len();

    if pdf_size < 1000 {
        return Err(format!("PDF 文件过小，可能导出失败: {} bytes", pdf_size));
    }

    // 调试阶段先不要删除临时目录，方便检查生成的文件
    // std::fs::remove_dir_all(&work_dir).ok();

    Ok(())
}

#[tauri::command]
fn check_pandoc() -> bool {
    find_pandoc().is_some()
}

#[tauri::command]
fn get_pandoc_version() -> Result<String, String> {
    if let Some(pandoc_path) = find_pandoc() {
        let result = Command::new(&pandoc_path)
            .arg("--version")
            .output()
            .map_err(|e| format!("无法执行 Pandoc: {}", e))?;
        let version = String::from_utf8_lossy(&result.stdout);
        let first_line = version.lines().next().unwrap_or("Pandoc (unknown version)");
        Ok(first_line.to_string())
    } else {
        Err("Pandoc 未安装".to_string())
    }
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", now.as_millis())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            export_docx,
            export_pdf_with_edge,
            check_pandoc,
            get_pandoc_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
