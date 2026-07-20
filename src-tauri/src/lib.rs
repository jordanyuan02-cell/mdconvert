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

/// Embedded reference.docx template for Pandoc DOCX styling.
/// Compiled into the binary via include_bytes! to work reliably
/// in both `tauri dev` and production builds.
/// Uses tblStylePr w:type="firstRow" for header cell shading + bold.
const REFERENCE_DOCX_BYTES: &[u8] = include_bytes!("../resources/reference.docx");

/// Pre-process markdown to convert \ce{...} (mhchem) to standard LaTeX
/// that Pandoc can render in DOCX output.
///
/// Examples:
///   \ce{H2O}  → \mathrm{H_{2}O}
///   \ce{Na+}  → \mathrm{Na^{+}}
///   \ce{e-}   → \mathrm{e^{-}}
///   \ce{2H2 + O2 -> 2H2O} → 2\mathrm{H_{2}} + \mathrm{O_{2}} \rightarrow 2\mathrm{H_{2}O}
fn preprocess_chemistry(markdown: &str) -> String {
    use regex::Regex;

    let ce_re = Regex::new(r"\\ce\{([^}]*)\}").unwrap();
    ce_re
        .replace_all(markdown, |caps: &regex::Captures| {
            let inner = caps[1].trim();
            convert_ce_inner(inner)
        })
        .to_string()
}

/// Convert the inner content of a \ce{...} command to standard LaTeX.
fn convert_ce_inner(inner: &str) -> String {
    // Replace chemical arrows with LaTeX equivalents
    let s = inner
        .replace("->", " \\rightarrow ")
        .replace("=>", " \\Rightarrow ")
        .replace("<=>", " \\rightleftharpoons ");

    let tokens: Vec<&str> = s.split_whitespace().collect();
    let mut result: Vec<String> = Vec::new();

    for token in tokens {
        if token == "\\rightarrow"
            || token == "\\Rightarrow"
            || token == "\\rightleftharpoons"
            || token == "+"
        {
            result.push(token.to_string());
        } else if token.starts_with('\\') {
            // Already a LaTeX command, pass through
            result.push(token.to_string());
        } else {
            // Chemical formula – wrap in \mathrm{} with proper subscripts/charges
            result.push(wrap_formula(token));
        }
    }

    result.join(" ")
}

/// Wrap a single chemical formula token in \mathrm{} with proper formatting.
fn wrap_formula(token: &str) -> String {
    use regex::Regex;

    // Split leading coefficient: "2H2O" → ("2", "H2O")
    let (coeff, formula) = {
        let digit_end = token.find(|c: char| !c.is_ascii_digit()).unwrap_or(0);
        if digit_end > 0 {
            (&token[..digit_end], &token[digit_end..])
        } else {
            ("", token)
        }
    };

    if formula.is_empty() {
        return coeff.to_string();
    }

    // Add subscripts: H2O → H_{2}O
    let subscript_re = Regex::new(r"([A-Za-z])(\d+)").unwrap();
    let with_sub = subscript_re.replace_all(formula, |caps: &regex::Captures| {
        format!("{}_{{{}}}", &caps[1], &caps[2])
    });

    // Handle charge at end: Na+ → Na^{+}, e- → e^{-}
    let charge_re = Regex::new(r"([A-Za-z])([+-])$").unwrap();
    let with_charge = charge_re.replace_all(&with_sub, |caps: &regex::Captures| {
        format!("{}^{{{}}}", &caps[1], &caps[2])
    });

    format!("{}\\mathrm{{{}}}", coeff, with_charge)
}

#[tauri::command]
async fn export_docx(
    _app_handle: tauri::AppHandle,
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

    // Pre-process markdown: convert \ce{...} to standard LaTeX
    let processed_markdown = preprocess_chemistry(&markdown);

    // Write the processed markdown to temp file
    let input_md_path = temp_dir.join("input.md");
    fs::write(&input_md_path, &processed_markdown)
        .map_err(|e| format!("无法写入输入文件: {}", e))?;

    // Write embedded reference.docx to temp dir (works in both dev and production)
    let reference_docx_path = temp_dir.join("reference.docx");
    fs::write(&reference_docx_path, REFERENCE_DOCX_BYTES)
        .map_err(|e| format!("无法写入样式模板文件: {}", e))?;

    // Build pandoc command
    let mut cmd = Command::new(&pandoc_path);
    cmd.arg(input_md_path.to_str().unwrap())
        .arg("-f")
        .arg("markdown+tex_math_dollars+tex_math_single_backslash+pipe_tables+multiline_tables+fenced_code_blocks+task_lists+grid_tables+hard_line_breaks")
        .arg("-t")
        .arg("docx")
        .arg("-s")
        .arg("--resource-path=.")
        .arg("-o")
        .arg(&output_path)
        // Use embedded reference.docx for consistent table/code styles
        .arg(format!("--reference-doc={}", reference_docx_path.display()))
        // Use tango syntax highlighting style for code blocks (Pandoc 3.10+)
        .arg("--syntax-highlighting=tango");

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

    // ── Write HTML to file ───────────────────────────────────────────
    // NOTE: `html_content` from the frontend is already a complete HTML
    // document (with KaTeX CSS, print styles, etc.), so we write it
    // directly without any wrapping.
    let full_html = &html_content;

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
