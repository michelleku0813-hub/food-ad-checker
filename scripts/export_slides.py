"""把 slides/src 的投影片原始檔輸出成 PDF（每類一份＋合輯）與 PPTX。

需要：Google Chrome（用來排版輸出 PDF）、scripts/requirements-slides.txt 的套件。

用法：
    python scripts/export_slides.py check   # 檢查有沒有內容超出版面
    python scripts/export_slides.py build   # 產生 slides/PDF、slides/PPTX、slides/00_全部12類合輯.pdf

Chrome 不在預設位置時，用環境變數 CHROME 指定執行檔路徑。
"""
import html
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "slides" / "src"
OUT = ROOT / "slides"
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
TMP = Path(tempfile.mkdtemp(prefix="slides-export-"))
WORK = TMP / "work"
PROFILE = TMP / "chrome-profile"

FONTS = "https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;700;900&family=Noto+Sans+TC:wght@400;500;700&display=swap"

CSS = """
@page { size: 1920px 1080px; margin: 0 }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #F6F3EC; }
section { width: 1920px; height: 1080px; box-sizing: border-box; position: relative; overflow: hidden; break-after: page; }
section * { box-sizing: border-box; }
h1, h2, h3, p, ul, ol { margin: 0; }
ul, ol { padding-left: 1.3em; }
li + li { margin-top: 4px; }
aside { display: none; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #D9D2C3; padding: 0.35em 0.6em; text-align: left; vertical-align: top; }
th { font-weight: 700; }
"""

# 字型載入後量測每張投影片的內容底部，寫進 <pre id="report"> 供 --dump-dom 讀取
CHECK_JS = """
<script>
document.fonts.ready.then(() => setTimeout(() => {
  const rows = [];
  document.querySelectorAll('section').forEach(sec => {
    const top = sec.getBoundingClientRect().top;
    const limit = sec.id === 'cover' ? 952 : 920;
    let maxb = 0;
    for (const el of sec.children) {
      if (el.tagName === 'ASIDE' || getComputedStyle(el).position === 'absolute') continue;
      maxb = Math.max(maxb, el.getBoundingClientRect().bottom - top);
    }
    const wide = [];
    sec.querySelectorAll('p,h1,h2,h3,li,td,th').forEach(el => {
      if (el.scrollWidth > el.clientWidth + 2) wide.push(el.textContent.trim().slice(0, 14));
    });
    rows.push([sec.id, Math.round(maxb), limit, wide.join(' / ')].join('|'));
  });
  const pre = document.createElement('pre');
  pre.id = 'report';
  pre.textContent = rows.join('\\n');
  document.body.appendChild(pre);
}, 800));
</script>
"""


def deck_list():
    out = []
    for d in sorted(p for p in SRC.iterdir() if p.is_dir()):
        meta = json.loads((d / "deck.json").read_text("utf-8"))
        slides = [(sid, (d / "slides" / f"{sid}.html").read_text("utf-8")) for sid in meta["order"]]
        out.append({"num": d.name[1:3], "name": meta["title"].split("｜")[0], "title": meta["title"], "slides": slides})
    return out


def wrapper(title, slides, check=False):
    body = "\n".join(src for _, src in slides)
    # 法條編號與「數字 單位」之間改用不換行空白，避免「§28／I」「17／件」被拆到兩行
    body = re.sub(r"§(\d+) ", "§\\1\u00a0", body)
    body = re.sub(r"(\d) (?=[\u4e00-\u9fff%％])", "\\1\u00a0", body)
    return (
        f'<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><title>{html.escape(title)}</title>'
        f'<link rel="stylesheet" href="{FONTS}"><style>{CSS}</style></head><body>{body}'
        f'{CHECK_JS if check else ""}</body></html>'
    )


def chrome(*args):
    cmd = [CHROME, "--headless=new", "--disable-gpu", f"--user-data-dir={PROFILE}", "--no-first-run",
           "--window-size=1920,1080", "--virtual-time-budget=30000", *args]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180)


def check():
    WORK.mkdir(parents=True, exist_ok=True)
    problems = 0
    for dk in deck_list():
        f = WORK / f"check_{dk['num']}.html"
        f.write_text(wrapper(dk["title"], dk["slides"], check=True), "utf-8")
        r = chrome("--dump-dom", f.as_uri())
        m = re.search(r'<pre id="report">(.*?)</pre>', r.stdout, re.S)
        if not m:
            print(dk["num"], "沒有取得量測結果", r.stderr[-300:])
            problems += 1
            continue
        for line in html.unescape(m.group(1)).splitlines():
            sid, bottom, limit, wide = line.split("|")
            if int(bottom) > int(limit) or wide:
                problems += 1
                print(f"{dk['num']} {sid}: 內容底部 {bottom}px（上限 {limit}px）{('，過寬：' + wide) if wide else ''}")
    print("問題數：", problems)
    return problems


def build():
    import fitz  # PyMuPDF
    from pptx import Presentation
    from pptx.util import Emu

    WORK.mkdir(parents=True, exist_ok=True)
    (OUT / "PDF").mkdir(parents=True, exist_ok=True)
    (OUT / "PPTX").mkdir(parents=True, exist_ok=True)
    merged = fitz.open()
    toc = []
    for dk in deck_list():
        base = f"{dk['num']}_{dk['name']}"
        page_html = WORK / f"deck_{dk['num']}.html"
        page_html.write_text(wrapper(dk["title"], dk["slides"]), "utf-8")
        pdf_path = OUT / "PDF" / f"{base}.pdf"
        r = chrome("--no-pdf-header-footer", f"--print-to-pdf={pdf_path}", page_html.as_uri())
        doc = fitz.open(pdf_path)
        if doc.page_count != len(dk["slides"]):
            sys.exit(f"{base}：PDF 頁數 {doc.page_count} 與投影片數 {len(dk['slides'])} 不符\n{r.stderr[-300:]}")
        doc.set_metadata({"title": dk["title"], "author": "食品廣告合規檢測",
                          "subject": "臺北市政府衛生局 114/11～115/10 處罰案件整理"})
        doc.saveIncr()
        toc.append([1, f"{dk['num']} {dk['name']}", merged.page_count + 1])
        merged.insert_pdf(doc)

        # 每頁轉成 1920×1080 圖片放進 PPTX，並附上講者備註
        prs = Presentation()
        prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)
        blank = prs.slide_layouts[6]
        zoom = 1920 / doc[0].rect.width
        for i, page in enumerate(doc):
            png = WORK / f"{dk['num']}_{i + 1:02d}.png"
            page.get_pixmap(matrix=fitz.Matrix(zoom, zoom)).save(png)
            slide = prs.slides.add_slide(blank)
            slide.shapes.add_picture(str(png), 0, 0, width=prs.slide_width, height=prs.slide_height)
            note = re.search(r"<aside>(.*?)</aside>", dk["slides"][i][1], re.S)
            if note:
                slide.notes_slide.notes_text_frame.text = html.unescape(note.group(1)).strip()
        prs.core_properties.title = dk["title"]
        prs.save(OUT / "PPTX" / f"{base}.pptx")
        print("完成", base, doc.page_count, "頁")
        doc.close()

    merged.set_toc(toc)
    merged.set_metadata({"title": "食品廣告違規類別簡報｜全部 12 類合輯", "author": "食品廣告合規檢測"})
    merged.save(OUT / "00_全部12類合輯.pdf", garbage=3, deflate=True)
    print("合輯", merged.page_count, "頁")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("check", "build"):
        sys.exit(__doc__)
    {"check": check, "build": build}[sys.argv[1]]()
