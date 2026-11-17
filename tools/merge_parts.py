"""사진별 판독 파일(work/parts/*.json)을 data/items.json에 이어 붙인다.

규칙
- items.json에 이미 있는 id는 건드리지 않는다(검수에서 고친 내용 보존, id 불변).
- 새 id만 뒤에 붙인다. 붙이는 순서: 교과서 사진(파일 이름 순) → 유인물 사진, 사진 안에서는 판독 순서.
- work/skip.json에 적힌 id는 넣지 않는다.
- 유인물 항목의 단원은 ref_page(교과서 쪽수)를 data/units.json의 쪽 범위에 대어 정한다.
- 유인물 ref_page와 교과서 page가 같은 항목끼리 links로 연결한다(전체 항목에 대해 매번 다시 계산).

사용법 (프로젝트 루트에서)
  python -I tools/merge_parts.py            # 새 항목만 이어 붙임
  python -I tools/merge_parts.py --rebuild  # 처음부터 다시 만듦(검수 전에만 사용)
"""
import sys as _sys
try:
    _sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTS = os.path.join(ROOT, "work", "parts")
SKIP = os.path.join(ROOT, "work", "skip.json")
ITEMS = os.path.join(ROOT, "data", "items.json")
UNITS = os.path.join(ROOT, "data", "units.json")
EXCLUDED = os.path.join(ROOT, "work", "excluded.json")

MARK_MAP = {"bracket": "circle"}  # 세로 괄호로 묶은 표시는 '동그라미로 묶음'과 같게 취급
FIELD_ORDER = [
    "id", "source", "file", "page", "unit", "section", "text", "level", "mark",
    "star", "keywords", "confidence", "note",
    "title_star", "overview", "handout", "ref_page", "links", "level_from", "figure", "kind",
    "stem", "choices", "answer", "answer_note", "region", "rot",
]


def load(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def photo_key(name):
    """KakaoTalk_YYYYMMDD_HHMMSSmmm[_NN].jpg → (묶음, 번호) 로 정렬."""
    m = re.match(r"KakaoTalk_(\d+)_(\d+)(?:_(\d+))?\.jpg$", name)
    if not m:
        return (name, 0, 0)
    return (m.group(1), int(m.group(2)), int(m.group(3) or 0))


def unit_for_page(units, page):
    for u in units:
        if u["from"] <= page <= u["to"]:
            return u["unit"]
    return None


def ordered(item):
    out = {}
    for k in FIELD_ORDER:
        if k in item:
            out[k] = item[k]
    for k in item:  # 혹시 모를 추가 필드
        if k not in out:
            out[k] = item[k]
    return out


def relink(items):
    """유인물(ref_page) ↔ 교과서(page) 연결을 다시 계산한다."""
    by_page, by_ref = {}, {}
    for it in items:
        if it["source"] == "textbook" and it.get("page"):
            by_page.setdefault(it["page"], []).append(it["id"])
        if it["source"] == "handout" and it.get("ref_page"):
            by_ref.setdefault(it["ref_page"], []).append(it["id"])
    for it in items:
        if it["source"] == "handout":
            links = by_page.get(it.get("ref_page"), []) if it.get("ref_page") else []
        else:
            links = by_ref.get(it.get("page"), [])
        if links:
            it["links"] = list(links)
        else:
            it.pop("links", None)


def save_items(items):
    os.makedirs(os.path.dirname(ITEMS), exist_ok=True)
    tmp = ITEMS + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump([ordered(it) for it in items], f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, ITEMS)


def main():
    rebuild = "--rebuild" in sys.argv
    applied_dir = os.path.join(ROOT, "work", "review_applied")
    if rebuild and os.path.isdir(applied_dir) and os.listdir(applied_dir) and "--force" not in sys.argv:
        raise SystemExit("검수 결과가 이미 반영돼 있어서 --rebuild 하면 고친 내용이 사라집니다. "
                         "정말 처음부터 만들려면 --rebuild --force")
    units = load(UNITS)["units"]
    skip_doc = load(SKIP, {"skip": {}})
    skip = skip_doc["skip"]
    restored = set(skip_doc.get("restored", []))  # 검수에서 되살린 ‘지운 흔적’ 자리
    existing = [] if rebuild else (load(ITEMS, []) or [])
    have = {it["id"] for it in existing}

    parts = []
    for fn in os.listdir(PARTS):
        if fn.endswith(".json"):
            parts.append(load(os.path.join(PARTS, fn)))
    parts.sort(key=lambda p: (0 if p["photo"]["source"] == "textbook" else 1, photo_key(p["photo"]["file"])))

    added, skipped, dropped_kw, excluded = [], [], [], []
    seen_new = set()
    for part in parts:
        ph = part["photo"]
        df = part.get("defaults", {})
        for ex in part.get("excluded_uncertain", []):
            if f"{ph['file']}#{ex['text']}" in restored:
                continue
            excluded.append({"source": ph["source"], "file": ph["file"], "rot": ph.get("rot", 0), **ex})
        for raw in part["items"]:
            iid = raw["id"]
            if iid in skip:
                skipped.append(iid)
                continue
            if iid in have:
                continue
            if iid in seen_new:
                raise SystemExit(f"판독 파일 안에서 id가 겹침: {iid}")
            seen_new.add(iid)

            it = {"id": iid, "source": ph["source"], "file": ph["file"]}
            it["page"] = raw.get("page", df.get("page")) if ph["source"] == "textbook" else None
            ref_page = raw.get("ref_page")
            unit = raw.get("unit") or df.get("unit")
            if not unit and ref_page:
                unit = unit_for_page(units, ref_page)
            it["unit"] = unit
            it["section"] = raw.get("section", df.get("section", ""))
            it["text"] = raw["text"]
            it["level"] = raw["level"]
            it["mark"] = MARK_MAP.get(raw["mark"], raw["mark"])
            # star: ☆이 직접 붙은 항목 하나에만(제목 옆 ☆이면 그 제목을 나타내는 묶음 항목).
            # title_star: ☆ 붙은 제목 아래에 딸린 항목(기록만 해 두고 star로 치지 않는다).
            it["star"] = bool(raw.get("star", False)) and it["level"] == "red"  # 별표는 red 안에서만 의미가 있다
            kws = []
            for kw in raw.get("keywords", []):
                if kw in it["text"]:
                    kws.append(kw)
                else:
                    dropped_kw.append((iid, kw))
            it["keywords"] = kws
            it["confidence"] = raw["confidence"]
            prefix = raw.get("note_prefix", df.get("note_prefix", ""))
            it["note"] = (prefix + raw.get("note", "")).strip()
            if ph["source"] == "handout":
                it["handout"] = raw.get("handout", ph.get("handout", ""))
                it["ref_page"] = ref_page
            for k in ("level_from", "stem", "choices", "answer", "answer_note"):
                if k in raw:
                    it[k] = raw[k]
            if raw.get("title_star") and not it["star"] and it["level"] == "red":
                it["title_star"] = True
            if raw.get("overview"):
                it["overview"] = True
            if raw.get("figure"):
                it["figure"] = True
            kind = raw.get("kind", df.get("kind", ""))
            if kind:
                it["kind"] = kind
            if "region" in raw:
                it["region"] = raw["region"]
            it["rot"] = ph.get("rot", 0)
            added.append(it)

    items = existing + added
    relink(items)
    save_items(items)
    with open(EXCLUDED, "w", encoding="utf-8", newline="\n") as f:
        json.dump(excluded, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"기존 {len(existing)}개 + 새로 {len(added)}개 = 모두 {len(items)}개  (건너뜀 {len(skipped)}개)")
    if dropped_kw:
        print(f"본문에 없는 keywords {len(dropped_kw)}개를 뺐음:")
        for iid, kw in dropped_kw:
            print(f"  {iid}: {kw}")


if __name__ == "__main__":
    main()
