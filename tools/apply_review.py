"""검수 결과(work/review_result.json)를 data/items.json에 반영한다.

- 판독 맞음: confidence → "high"
- 고침: text / level / star / keywords 를 바꾸고 confidence → "high"
  (keywords를 따로 고치지 않았으면, 바뀐 글에 그대로 남아 있는 것만 둔다)
- 빼기: items.json에서 지우고 work/skip.json에 적는다(다시 합칠 때 안 들어오게).
- 메모: note 끝에 "검수 메모: …"로 붙인다(메모만 쓰고 확인하지 않은 항목은 low로 남는다).
- 지운 흔적으로 뺀 곳을 "넣기"로 고른 것: 새 id로 items.json에 넣는다.
반영하고 나면 결과 파일은 work/review_applied/<시각>.json 으로 옮기고,
work/review_result.json 은 빈 상태로 다시 만든다.

사용법 (프로젝트 루트에서)
  python -I tools/apply_review.py --dry-run   # 바뀔 내용만 보여 줌
  python -I tools/apply_review.py             # 반영
"""
import datetime
import json
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from merge_parts import relink, save_items, unit_for_page  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ITEMS = os.path.join(ROOT, "data", "items.json")
UNITS = os.path.join(ROOT, "data", "units.json")
STATE = os.path.join(ROOT, "work", "review_result.json")
SKIP = os.path.join(ROOT, "work", "skip.json")
EXCLUDED = os.path.join(ROOT, "work", "excluded.json")
PARTS = os.path.join(ROOT, "work", "parts")
APPLIED = os.path.join(ROOT, "work", "review_applied")


def load(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def dump(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def short(t, n=40):
    t = t.replace("\n", " ")
    return t if len(t) <= n else t[:n] + "…"


def all_known_ids(items, skip):
    ids = {it["id"] for it in items} | set(skip.get("skip", {}))
    for fn in os.listdir(PARTS):
        if fn.endswith(".json"):
            for it in load(os.path.join(PARTS, fn))["items"]:
                ids.add(it["id"])
    return ids


def next_id(page, known):
    prefix = f"tb-{page:03d}-"
    nums = [int(m.group(1)) for i in known if (m := re.match(re.escape(prefix) + r"(\d+)$", i))]
    return f"{prefix}{(max(nums) + 1 if nums else 1):02d}"


def main():
    dry = "--dry-run" in sys.argv
    today = datetime.date.today().isoformat()
    state = load(STATE)
    if not state or (not state.get("items") and not state.get("excluded")):
        print("반영할 검수 결과가 없습니다(work/review_result.json이 비어 있음).")
        return
    items = load(ITEMS)
    units = load(UNITS)["units"]
    skip = load(SKIP, {"skip": {}})
    skip.setdefault("skip", {})
    skip.setdefault("restored", [])
    excluded = load(EXCLUDED, [])
    by_id = {it["id"]: it for it in items}
    log = {"확인": [], "고침": [], "빼기": [], "메모만": [], "넣기": [], "없는 id": []}
    dropped_kw = []
    remove = set()

    for iid, s in state.get("items", {}).items():
        it = by_id.get(iid)
        if it is None:
            log["없는 id"].append(iid)
            continue
        memo = (s.get("memo") or "").strip()
        if s.get("exclude"):
            remove.add(iid)
            skip["skip"][iid] = f"검수({today})에서 뺌" + (f": {memo}" if memo else "")
            log["빼기"].append(f"{iid}  {short(it['text'])}")
            continue
        edited = any(k in s for k in ("text", "level", "star", "keywords"))
        before = dict(it)
        if "text" in s:
            it["text"] = s["text"].strip()
        if "level" in s:
            it["level"] = s["level"]
        kws = s["keywords"] if "keywords" in s else it.get("keywords", [])
        it["keywords"] = [k for k in kws if k in it["text"]]
        dropped_kw += [(iid, k) for k in kws if k not in it["text"]]
        if it["level"] != "red":
            it["star"] = False
            it.pop("title_star", None)
        elif "star" in s:
            it["star"] = bool(s["star"])
            if it["star"]:
                it.pop("title_star", None)
        notes = []
        if edited or s.get("ok"):
            it["confidence"] = "high"
            notes.append(f"검수({today}) " + ("고침" if edited else "확인"))
        if memo:
            notes.append(f"검수 메모: {memo}")
        if notes:
            it["note"] = (it.get("note", "") + " / " + " / ".join(notes)).strip(" /")
        if edited:
            diffs = []
            if before["text"] != it["text"]:
                diffs.append(f"글: {short(before['text'], 30)} → {short(it['text'], 30)}")
            if before["level"] != it["level"]:
                diffs.append(f"등급: {before['level']} → {it['level']}")
            if bool(before.get("star")) != bool(it.get("star")):
                diffs.append(f"별표: {bool(before.get('star'))} → {bool(it.get('star'))}")
            if before.get("keywords") != it["keywords"]:
                diffs.append("가릴 말 바뀜")
            log["고침"].append(f"{iid}  " + "; ".join(diffs or ["(바뀐 값 없음)"]))
        elif s.get("ok"):
            log["확인"].append(iid)
        elif memo:
            log["메모만"].append(f"{iid}  {memo}")

    items = [it for it in items if it["id"] not in remove]

    # 지운 흔적으로 뺐던 곳 되살리기
    known = all_known_ids(items, skip) | remove
    ex_keep = []
    for ex in excluded:
        key = f"{ex['file']}#{ex['text']}"
        s = state.get("excluded", {}).get(key)
        if not (s and s.get("restore")):
            ex_keep.append(ex)
            continue
        page = ex.get("page")
        new_id = next_id(page, known)
        known.add(new_id)
        same = [i for i, it in enumerate(items) if it["file"] == ex["file"]]
        section = items[same[-1]]["section"] if same else ""
        new = {
            "id": new_id, "source": ex["source"], "file": ex["file"], "page": page,
            "unit": unit_for_page(units, page), "section": section,
            "text": (s.get("text") or ex["text"]).strip(), "level": s.get("level", "red"),
            "mark": "underline", "star": False, "keywords": [], "confidence": "high",
            "note": f"검수({today})에서 되살림 — 처음엔 지운 흔적으로 보고 뺐음({ex.get('why', '')})",
            "region": ex.get("region"), "rot": ex.get("rot", 0),
        }
        pos = (same[-1] + 1) if same else len(items)
        items.insert(pos, new)
        skip["restored"].append(key)
        log["넣기"].append(f"{new_id}  [{new['level']}] {short(new['text'])}")

    relink(items)

    for k, v in log.items():
        if v:
            print(f"■ {k} {len(v)}개")
            for line in v:
                print("   ", line)
    if dropped_kw:
        print(f"■ 글에 없어서 뺀 가릴 말 {len(dropped_kw)}개: " + ", ".join(f"{i}:{k}" for i, k in dropped_kw))
    left = sum(1 for it in items if it["confidence"] == "low")
    print(f"\n반영 뒤 항목 {len(items)}개, 아직 확실하지 않은 항목 {left}개")

    if dry:
        print("(--dry-run: 파일은 바꾸지 않았습니다)")
        return
    save_items(items)
    dump(SKIP, skip)
    dump(EXCLUDED, ex_keep)
    os.makedirs(APPLIED, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    shutil.copyfile(STATE, os.path.join(APPLIED, f"{stamp}.json"))
    dump(STATE, {"version": 1, "items": {}, "excluded": {}, "applied_at": stamp})
    print(f"반영 완료. 원본 검수 결과는 work/review_applied/{stamp}.json 에 보관했습니다.")


if __name__ == "__main__":
    main()
