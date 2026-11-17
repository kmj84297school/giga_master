"""data/ 검증 스크립트.

  python -I tools/validate.py              # items.json, questions.json 형식 검사
  python -I tools/validate.py --coverage   # + 모든 red 항목이 문제의 근거인지, star 항목은 3문제 이상인지

오류가 하나라도 있으면 종료 코드 1.

items.json 검사
  - 필수 필드, id 중복 없음, level/mark/confidence 값, star는 red에만
  - 교과서 항목은 page가 숫자, 유인물 항목은 page가 null
  - file이 raw/<source>/ 에 실제로 있음, unit이 units.json에 있음
  - keywords가 모두 text 안에 들어 있음(가리고 외우기에서 가릴 수 있어야 함)
  - links / level_from 이 가리키는 id가 있음
  - 교과서 문제 항목(kind=problem)에 choices가 있으면 5개이고 answer가 1~5

questions.json 검사
  - id 중복 없음, 유형 값, 발문·해설 있음
  - 보기 5개(빈 것·겹치는 것 없음), 정답 번호 1~5
  - 근거 id가 모두 items.json에 있음, red 문제의 근거는 모두 red 항목
  - ㄱㄴㄷ 조합형(combo)은 shuffle이 false
"""
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

LEVELS = {"red", "blue"}
MARKS = {"underline", "circle", "handwriting", "rule", "unmarked"}
CONF = {"high", "low"}
SOURCES = {"textbook", "handout"}
QTYPES = {"correct", "incorrect", "combo", "match", "calc"}
ITEM_REQUIRED = ["id", "source", "file", "page", "unit", "section", "text", "level",
                 "mark", "star", "keywords", "confidence", "note"]
Q_REQUIRED = ["id", "type", "stem", "choices", "answer", "explanation", "evidence", "level"]

errors, warnings = [], []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def load(name):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        err(f"{name}: JSON 형식 오류 — {e}")
        return None


def check_items(items, units):
    ids = {}
    unit_names = {u["unit"] for u in units}
    for n, it in enumerate(items):
        where = f"items[{n}] {it.get('id', '(id 없음)')}"
        for k in ITEM_REQUIRED:
            if k not in it:
                err(f"{where}: 필드 없음 '{k}'")
        iid = it.get("id")
        if not isinstance(iid, str) or not iid:
            err(f"{where}: id가 비어 있음")
            continue
        if iid in ids:
            err(f"{where}: id 중복 (items[{ids[iid]}]와 같음)")
        ids[iid] = n
        if it.get("source") not in SOURCES:
            err(f"{where}: source 값이 잘못됨 '{it.get('source')}'")
        if it.get("level") not in LEVELS:
            err(f"{where}: level 값이 잘못됨 '{it.get('level')}'")
        if it.get("mark") not in MARKS:
            err(f"{where}: mark 값이 잘못됨 '{it.get('mark')}'")
        if it.get("confidence") not in CONF:
            err(f"{where}: confidence 값이 잘못됨 '{it.get('confidence')}'")
        if not isinstance(it.get("star"), bool):
            err(f"{where}: star가 true/false가 아님")
        elif it["star"] and it.get("level") != "red":
            err(f"{where}: star는 red 항목에만 붙일 수 있음")
        elif it["star"] and it.get("title_star"):
            err(f"{where}: star와 title_star를 함께 붙일 수 없음")
        if it.get("source") == "textbook" and not isinstance(it.get("page"), int):
            err(f"{where}: 교과서 항목인데 page가 숫자가 아님")
        if it.get("source") == "handout" and it.get("page") is not None:
            err(f"{where}: 유인물 항목의 page는 null이어야 함(교과서 쪽수는 ref_page)")
        if it.get("unit") not in unit_names:
            err(f"{where}: unit이 units.json에 없음 '{it.get('unit')}'")
        text = it.get("text")
        if not isinstance(text, str) or not text.strip():
            err(f"{where}: text가 비어 있음")
            text = ""
        kws = it.get("keywords")
        if not isinstance(kws, list) or any(not isinstance(k, str) or not k for k in kws):
            err(f"{where}: keywords는 빈 문자열 없는 목록이어야 함")
        else:
            for k in kws:
                if k not in text:
                    err(f"{where}: keyword '{k}'가 text 안에 없음")
            if it.get("level") == "red" and not kws and it.get("kind") != "problem":
                warn(f"{where}: red 항목인데 keywords가 없음(가리고 외우기에서 빠짐)")
        f = it.get("file")
        if isinstance(f, str) and it.get("source") in SOURCES:
            if not os.path.exists(os.path.join(ROOT, "raw", it["source"], f)):
                err(f"{where}: 사진 파일이 없음 raw/{it['source']}/{f}")
        if "choices" in it:
            ch = it["choices"]
            if not isinstance(ch, list) or len(ch) != 5:
                err(f"{where}: choices는 5개여야 함")
            if not isinstance(it.get("answer"), int) or not 1 <= it["answer"] <= 5:
                err(f"{where}: choices가 있는 문제의 answer는 1~5여야 함")
        reg = it.get("region")
        if reg is not None:
            ok = (isinstance(reg, list) and len(reg) == 4 and all(isinstance(v, (int, float)) for v in reg)
                  and 0 <= reg[0] < reg[2] <= 1 and 0 <= reg[1] < reg[3] <= 1)
            if not ok:
                err(f"{where}: region은 [x0, y0, x1, y1] (0~1, x0<x1, y0<y1)")
    for n, it in enumerate(items):
        where = f"items[{n}] {it.get('id')}"
        for ref in it.get("links", []):
            if ref not in ids:
                err(f"{where}: links의 id가 없음 '{ref}'")
        if "level_from" in it and it["level_from"] not in ids:
            err(f"{where}: level_from의 id가 없음 '{it['level_from']}'")
    return ids


def check_questions(questions, items, item_ids, coverage):
    by_id = {it["id"]: it for it in items if isinstance(it.get("id"), str)}
    qids = {}
    used = {}
    for n, q in enumerate(questions):
        where = f"questions[{n}] {q.get('id', '(id 없음)')}"
        for k in Q_REQUIRED:
            if k not in q:
                err(f"{where}: 필드 없음 '{k}'")
        qid = q.get("id")
        if not isinstance(qid, str) or not qid:
            err(f"{where}: id가 비어 있음")
        elif qid in qids:
            err(f"{where}: id 중복 (questions[{qids[qid]}]와 같음)")
        else:
            qids[qid] = n
        if q.get("type") not in QTYPES:
            err(f"{where}: type 값이 잘못됨 '{q.get('type')}'")
        if q.get("level") not in LEVELS:
            err(f"{where}: level 값이 잘못됨 '{q.get('level')}'")
        for k in ("stem", "explanation"):
            if not isinstance(q.get(k), str) or not q[k].strip():
                err(f"{where}: {k}이(가) 비어 있음")
        ch = q.get("choices")
        if not isinstance(ch, list) or len(ch) != 5:
            err(f"{where}: 보기는 5개여야 함 (지금 {len(ch) if isinstance(ch, list) else '목록 아님'})")
        else:
            if any(not isinstance(c, str) or not c.strip() for c in ch):
                err(f"{where}: 빈 보기가 있음")
            elif len({c.strip() for c in ch}) != 5:
                err(f"{where}: 같은 보기가 두 번 나옴")
        ans = q.get("answer")
        if not isinstance(ans, int) or isinstance(ans, bool) or not 1 <= ans <= 5:
            err(f"{where}: 정답 번호는 1~5여야 함 (지금 {ans!r})")
        ev = q.get("evidence")
        if not isinstance(ev, list) or not ev:
            err(f"{where}: 근거 항목 id 목록이 비어 있음")
        else:
            for e in ev:
                if e not in item_ids:
                    err(f"{where}: 근거 id가 items.json에 없음 '{e}'")
                else:
                    used.setdefault(e, set()).add(qid)
                    if q.get("level") == "red" and by_id[e].get("level") != "red":
                        err(f"{where}: red 문제인데 근거 '{e}'가 red 항목이 아님")
        if q.get("type") == "combo" and q.get("shuffle", True):
            err(f"{where}: ㄱㄴㄷ 조합형은 shuffle이 false여야 함")

    reds = [it for it in items if it.get("level") == "red"]
    uncovered = [it["id"] for it in reds if it["id"] not in used]
    thin_star = [(it["id"], len(used.get(it["id"], ()))) for it in reds
                 if it.get("star") and len(used.get(it["id"], ())) < 3]
    report = (err if coverage else warn)
    if uncovered:
        report(f"문제의 근거가 된 적 없는 red 항목 {len(uncovered)}개: " + ", ".join(uncovered[:15])
               + (" …" if len(uncovered) > 15 else ""))
    if thin_star:
        report(f"3문제 미만인 star 항목 {len(thin_star)}개: "
               + ", ".join(f"{i}({c})" for i, c in thin_star[:15]) + (" …" if len(thin_star) > 15 else ""))


def main():
    coverage = "--coverage" in sys.argv
    units_doc = load("units.json")
    items = load("items.json")
    questions = load("questions.json")
    if units_doc is None:
        err("data/units.json이 없음")
    if items is None:
        err("data/items.json이 없음")
    if not errors:
        if not isinstance(items, list):
            err("items.json은 목록이어야 함")
        else:
            item_ids = check_items(items, units_doc.get("units", []))
            if questions is None:
                warn("questions.json이 아직 없음")
            elif not isinstance(questions, list):
                err("questions.json은 목록이어야 함")
            else:
                check_questions(questions, items, item_ids, coverage)

    for w in warnings:
        print("경고:", w)
    for e in errors:
        print("오류:", e)
    n_items = len(items) if isinstance(items, list) else 0
    n_q = len(questions) if isinstance(questions, list) else 0
    print(f"\n항목 {n_items}개, 문제 {n_q}개 검사 — 오류 {len(errors)}개, 경고 {len(warnings)}개")
    if errors:
        print("검증 실패")
        sys.exit(1)
    print("검증 통과")


if __name__ == "__main__":
    main()
