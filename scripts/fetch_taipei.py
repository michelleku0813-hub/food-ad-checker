"""
抓取臺北市政府衛生局「食品、健康食品違規廣告處罰案件統計表」並轉成 data/cases.json。

資料來源：https://health.gov.taipei/News.aspx?n=13A23138C06A3532&sms=8E7386D329C4B210
網站只保留約 12 個月，所以本腳本會「合併」既有的 cases.json，舊月份不會因下架而消失。

用法：
    python scripts/fetch_taipei.py
"""

from __future__ import annotations

import base64
import html
import json
import re
import sys
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber
import requests

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT = ROOT / "data" / "cases.json"

LIST_URL = "https://health.gov.taipei/News.aspx?n=13A23138C06A3532&sms=8E7386D329C4B210&page={page}&PageSize=20"
DOWNLOAD_BASE = "https://www-ws.gov.taipei/"
HEADERS = {"User-Agent": "food-ad-checker/1.0 (research project)"}

TITLE_RE = re.compile(r"(\d{2,3})年(\d{1,2})月份處理食品、健康食品違規廣告處罰案件統計表")


def decode_name(href: str) -> str:
    m = re.search(r"[?&]n=([^&]+)", href)
    if not m:
        return ""
    s = urllib.parse.unquote(m.group(1))
    s += "=" * (-len(s) % 4)
    try:
        return base64.b64decode(s).decode("utf-8", "ignore")
    except Exception:
        return ""


def list_food_pdfs() -> dict[str, dict]:
    """回傳 {'115-10': {title, url, corrected}}，同月份有更正版時保留更正版。"""
    seen: set[str] = set()
    found: dict[str, dict] = {}
    for page in range(1, 30):
        r = requests.get(LIST_URL.format(page=page), headers=HEADERS, timeout=30)
        r.raise_for_status()
        hrefs = [html.unescape(h) for h in re.findall(r'href="([^"]*Download\.ashx[^"]*)"', r.text)]
        new = [h for h in hrefs if h not in seen]
        if not new:
            break
        seen.update(new)
        for href in new:
            name = decode_name(href)
            m = TITLE_RE.search(name)
            if not m:
                continue
            key = f"{int(m.group(1))}-{int(m.group(2)):02d}"
            corrected = "更正" in name
            url = href if href.startswith("http") else DOWNLOAD_BASE + href.lstrip("/")
            prev = found.get(key)
            if prev is None or (corrected and not prev["corrected"]):
                found[key] = {"title": name.removesuffix(".pdf"), "url": url, "corrected": corrected}
    return found


def download(key: str, url: str) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / f"food_{key}.pdf"
    if not path.exists():
        r = requests.get(url, headers=HEADERS, timeout=120)
        r.raise_for_status()
        path.write_bytes(r.content)
    return path


def clean(cell: str | None) -> str:
    if not cell:
        return ""
    # PDF 換行會把中文句子切斷，直接接起來；英數之間保留空白
    s = re.sub(r"(?<=[A-Za-z0-9])\n(?=[A-Za-z0-9])", " ", cell)
    s = s.replace("\n", "")
    return re.sub(r"\s{2,}", " ", s).strip()


COLUMNS = ["no", "date", "product", "source", "detail", "company", "fine", "law", "rank"]


def parse_pdf(path: Path) -> list[dict]:
    rows: list[dict] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for raw in table:
                    cells = [clean(c) for c in raw]
                    if len(cells) < 9 or cells[0] == "項次" or "裁處書" in cells[1]:
                        continue
                    rec = dict(zip(COLUMNS, cells[:9]))
                    if not rec["no"] and rec["date"] and rows:
                        # 有些 PDF 的項次欄漏印，但有發文日期就是新案件
                        rec["no"] = str(int(rows[-1]["no"]) + 1)
                    if not rec["no"] and rows:
                        # 跨頁延續的同一筆案件：把文字接回上一筆
                        prev = rows[-1]
                        for k in ("product", "detail", "company", "law"):
                            if rec[k]:
                                prev[k] += rec[k]
                        continue
                    if not rec["no"].isdigit():
                        continue
                    rows.append(rec)
    return rows


# 「…」引文中常見的旁白標記，例如 (主持人口述)、(中間字幕:…)、(手拿板)
NARRATION_RE = re.compile(r"[（(][^()（）]{0,20}(口述|字幕|手拿板|圖|旁白)[^()（）]{0,20}[)）]")
CLAIM_INTRO_RE = re.compile(r"(略以|宣稱|述及|內容)[：:]?\s*「")


def extract_claims(detail: str) -> list[str]:
    """從違規情節抽出被引用的違規詞句。"""
    claims: list[str] = []
    for m in CLAIM_INTRO_RE.finditer(detail):
        start = m.end()
        depth, i = 1, start
        while i < len(detail) and depth:
            if detail[i] == "「":
                depth += 1
            elif detail[i] == "」":
                depth -= 1
            i += 1
        quote = detail[start : i - 1]
        quote = re.sub(r"[（(]中間字幕[:：]", "", quote)
        quote = NARRATION_RE.sub("", quote)
        for part in re.split(r"…+|\.{3,}|⋯+", quote):
            part = part.strip(" 　,，、。；;:：()（）「」『』")
            if 2 <= len(part) <= 60:
                claims.append(part)
    # 去重但保留順序
    return list(dict.fromkeys(claims))


def classify(detail: str, law: str) -> dict:
    medical = "醫療效能" in detail or "第28條第2項" in law or "第14條第2項" in law
    health_food = "健康食品管理法" in law
    return {
        "category": "醫療效能" if medical else "不實誇張易生誤解",
        "productType": "健康食品" if health_food else "一般食品",
    }


def parse_int(s: str) -> int | None:
    digits = re.sub(r"[^\d]", "", s)
    return int(digits) if digits else None


def build_case(key: str, src: dict, rec: dict) -> dict:
    return {
        "id": f"{key}-{int(rec['no']):02d}",
        "month": key,
        "date": rec["date"],
        "product": rec["product"],
        "source": rec["source"],
        "company": rec["company"],
        "fine": parse_int(rec["fine"]),
        "law": rec["law"],
        **classify(rec["detail"], rec["law"]),
        "claims": extract_claims(rec["detail"]),
        "detail": rec["detail"],
        "pdfTitle": src["title"],
        "pdfUrl": src["url"],
    }


def main() -> int:
    existing: dict[str, list[dict]] = {}
    if OUT.exists():
        for c in json.loads(OUT.read_text("utf-8"))["cases"]:
            existing.setdefault(c["month"], []).append(c)

    pdfs = list_food_pdfs()
    print(f"列表上找到 {len(pdfs)} 個月份的食品類 PDF：{', '.join(sorted(pdfs))}")

    months = dict(existing)
    for key, src in sorted(pdfs.items()):
        path = download(key, src["url"])
        recs = parse_pdf(path)
        months[key] = [build_case(key, src, r) for r in recs]
        print(f"  {key}: {len(recs)} 件")

    cases = [c for k in sorted(months, reverse=True) for c in months[k]]
    payload = {
        "source": "臺北市政府衛生局 食品、健康食品違規廣告處罰案件統計表",
        "sourceUrl": LIST_URL.format(page=1).replace("&page=1&PageSize=20", ""),
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "months": sorted(months, reverse=True),
        "cases": cases,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), "utf-8")
    print(f"共 {len(cases)} 件，寫入 {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
