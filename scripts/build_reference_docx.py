"""
Build a custom Pandoc reference.docx with table styles matching the preview:
- Dark thin borders (0.5pt solid #333333)
- Light gray header background (#f0f0f0)
- Bold header text
- 6pt vertical / 8pt horizontal cell padding

Approach: patch the existing styles.xml instead of replacing it entirely,
so that heading styles (Heading 1..6, Title, etc.) and other Pandoc defaults
are preserved.

Usage: python scripts/build_reference_docx.py
"""
import zipfile
import shutil
import os
import tempfile
from xml.etree import ElementTree as ET

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
RESOURCES_DIR = os.path.join(PROJECT_DIR, "src-tauri", "resources")
TEMPLATE_PATH = os.path.join(RESOURCES_DIR, "reference.docx")

# XML namespaces used by Office Open XML
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
MC = "http://schemas.openxmlformats.org/markup-compatibility/2006"
W14 = "http://schemas.microsoft.com/office/word/2010/wordml"

NS = {"w": W, "r": R, "mc": MC, "w14": W14}

for prefix, uri in NS.items():
    ET.register_namespace(prefix, uri)


def find_or_create_child(parent, tag):
    """Find an existing child element by tag, or create a new one."""
    existing = parent.find(tag)
    if existing is not None:
        return existing
    child = ET.SubElement(parent, tag)
    return child


def set_border(border_el, color="333333", sz="4", space="0"):
    """Set border attributes on a border element."""
    border_el.set(f"{{{W}}}val", "single")
    border_el.set(f"{{{W}}}sz", sz)
    border_el.set(f"{{{W}}}color", color)
    border_el.set(f"{{{W}}}space", space)


def ensure_table_borders(tbl_pr):
    """Ensure tblBorders exists with dark thin borders on all 6 sides."""
    borders = find_or_create_child(tbl_pr, f"{{{W}}}tblBorders")
    for border_name in ["top", "left", "bottom", "right", "insideH", "insideV"]:
        b = find_or_create_child(borders, f"{{{W}}}{border_name}")
        set_border(b)
    return borders


def ensure_cell_margins(tbl_pr, top="120", bottom="120", left="160", right="160"):
    """Ensure tblCellMar exists with the given cell margins."""
    cell_mar = find_or_create_child(tbl_pr, f"{{{W}}}tblCellMar")
    for name, val in [("top", top), ("bottom", bottom), ("left", left), ("right", right)]:
        m = find_or_create_child(cell_mar, f"{{{W}}}{name}")
        m.set(f"{{{W}}}w", val)
        m.set(f"{{{W}}}type", "dxa")
    return cell_mar


def ensure_first_row_shading(style_el):
    """Ensure tblStylePr for firstRow exists with light gray shading + bold."""
    # Find existing firstRow tblStylePr
    existing = style_el.find(
        f"{{{W}}}tblStylePr[@{{{W}}}type='firstRow']"
    )
    if existing is not None:
        tbl_style_pr = existing
    else:
        tbl_style_pr = ET.SubElement(style_el, f"{{{W}}}tblStylePr")
        tbl_style_pr.set(f"{{{W}}}type", "firstRow")

    tc_pr = find_or_create_child(tbl_style_pr, f"{{{W}}}tcPr")
    shd = find_or_create_child(tc_pr, f"{{{W}}}shd")
    shd.set(f"{{{W}}}val", "clear")
    shd.set(f"{{{W}}}color", "auto")
    shd.set(f"{{{W}}}fill", "F0F0F0")

    r_pr = find_or_create_child(tbl_style_pr, f"{{{W}}}rPr")
    bold = find_or_create_child(r_pr, f"{{{W}}}b")
    # <w:b /> has no attributes; ensure it's empty
    for attr in list(bold.attrib.keys()):
        del bold.attrib[attr]

    return tbl_style_pr


def ensure_style(root, style_id, style_type, name, based_on=None):
    """Find an existing style element by styleId, or create a new one."""
    xpath = f"{{{W}}}style[@{{{W}}}styleId='{style_id}']"
    existing = root.find(xpath)
    if existing is not None:
        return existing, False

    style_el = ET.SubElement(root, f"{{{W}}}style")
    style_el.set(f"{{{W}}}type", style_type)
    style_el.set(f"{{{W}}}styleId", style_id)

    name_el = ET.SubElement(style_el, f"{{{W}}}name")
    name_el.set(f"{{{W}}}val", name)

    if based_on:
        based_on_el = ET.SubElement(style_el, f"{{{W}}}basedOn")
        based_on_el.set(f"{{{W}}}val", based_on)

    return style_el, True


def patch_styles_xml(styles_root):
    """Patch styles.xml: ensure table styles have borders + header shading.
    
    Keeps ALL existing styles (including heading styles). Only modifies
    or adds table-related styles.
    """
    # ----- Ensure "Table" style (Pandoc 3.x default for tables) -----
    style_table, created = ensure_style(
        styles_root, "Table", "table", "Table", based_on="TableNormal"
    )
    if created:
        style_table.set(f"{{{W}}}default", "1")
        ui = ET.SubElement(style_table, f"{{{W}}}uiPriority")
        ui.set(f"{{{W}}}val", "99")
        ET.SubElement(style_table, f"{{{W}}}qFormat")

    tbl_pr_t = find_or_create_child(style_table, f"{{{W}}}tblPr")
    ensure_table_borders(tbl_pr_t)
    ensure_cell_margins(tbl_pr_t)
    ensure_first_row_shading(style_table)

    # ----- Ensure "TableGrid" style (fallback) -----
    style_tg, created = ensure_style(
        styles_root, "TableGrid", "table", "Table Grid", based_on="TableNormal"
    )
    if created:
        ui = ET.SubElement(style_tg, f"{{{W}}}uiPriority")
        ui.set(f"{{{W}}}val", "39")
    tbl_pr_tg = find_or_create_child(style_tg, f"{{{W}}}tblPr")
    ensure_table_borders(tbl_pr_tg)
    ensure_cell_margins(tbl_pr_tg)

    # ----- Ensure "TableHeader" style (fallback) -----
    style_th, created = ensure_style(
        styles_root, "TableHeader", "table", "Table Header", based_on="TableGrid"
    )
    if created:
        ui = ET.SubElement(style_th, f"{{{W}}}uiPriority")
        ui.set(f"{{{W}}}val", "49")
    ensure_first_row_shading(style_th)

    # ----- Ensure "TableNormal" base style exists -----
    style_tn, created = ensure_style(
        styles_root, "TableNormal", "table", "Normal Table"
    )
    if created:
        style_tn.set(f"{{{W}}}uiPriority", "99")
        ET.SubElement(style_tn, f"{{{W}}}semiHidden")
        ET.SubElement(style_tn, f"{{{W}}}unhideWhenUsed")
        tbl_pr_tn = find_or_create_child(style_tn, f"{{{W}}}tblPr")
        tbl_ind = find_or_create_child(tbl_pr_tn, f"{{{W}}}tblInd")
        tbl_ind.set(f"{{{W}}}w", "0")
        tbl_ind.set(f"{{{W}}}type", "dxa")
        ensure_cell_margins(tbl_pr_tn, top="0", bottom="0")


def patch_reference_docx():
    """Extract reference.docx, patch styles.xml, repack."""
    if not os.path.exists(TEMPLATE_PATH):
        print(f"ERROR: {TEMPLATE_PATH} not found. Run pandoc to generate default first.")
        return

    # Work in a temp directory
    with tempfile.TemporaryDirectory() as tmpdir:
        # Extract
        with zipfile.ZipFile(TEMPLATE_PATH, "r") as zin:
            zin.extractall(tmpdir)

        # Parse existing styles.xml
        styles_path = os.path.join(tmpdir, "word", "styles.xml")
        tree = ET.parse(styles_path)
        styles_root = tree.getroot()

        # Patch table styles (preserves all other styles)
        patch_styles_xml(styles_root)

        # Write back
        tree.write(styles_path, encoding="UTF-8", xml_declaration=True)

        # Repack
        temp_output = TEMPLATE_PATH + ".tmp"
        with zipfile.ZipFile(temp_output, "w", zipfile.ZIP_DEFLATED) as zout:
            for dirpath, _, filenames in os.walk(tmpdir):
                for fn in filenames:
                    full_path = os.path.join(dirpath, fn)
                    arcname = os.path.relpath(full_path, tmpdir)
                    zout.write(full_path, arcname)

        # Replace original
        os.replace(temp_output, TEMPLATE_PATH)

    print(f"Patched: {TEMPLATE_PATH}")


if __name__ == "__main__":
    patch_reference_docx()
