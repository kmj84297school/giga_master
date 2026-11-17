"""문제 원본(work/qsrc/*.json)을 data/questions.json으로 만든다.

원본은 짧은 키로 쓴다:
  {"id": "IV-001", "t": "incorrect", "s": "발문", "c": ["보기1", … 5개], "a": 정답번호(1~5),
   "e": "해설", "ev": ["근거 항목 id", …], "bx": ["ㄱ. …", "ㄴ. …"] (조합형만)}
- t: correct(옳은 것) / incorrect(옳지 않은 것) / combo(ㄱㄴㄷ 조합) / match(짝짓기) / calc(계산)
- 단원·등급·별표·출처는 근거 항목에서 계산한다.
  등급: 근거가 모두 red면 red, 하나라도 blue면 blue
  별표: 근거 중 star 항목이 있으면 true
  출처: 교과서 쪽수와 유인물 이름을 모아서 적는다
- 조합형은 보기 순서를 섞지 않는다(shuffle: false).

사용법 (프로젝트 루트에서)
  python -I tools/build_questions.py
  python -I tools/validate.py --coverage
"""
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "work", "qsrc")
OUT = os.path.join(ROOT, "data", "questions.json")


def pages_text(pages):
    pages = sorted(set(pages))
    if not pages:
        return ""
    runs, start, prev = [], pages[0], pages[0]
    for p in pages[1:]:
        if p == prev + 1:
            prev = p
            continue
        runs.append((start, prev))
        start = prev = p
    runs.append((start, prev))
    return ", ".join(f"{a}쪽" if a == b else f"{a}~{b}쪽" for a, b in runs)


def main():
    with open(os.path.join(ROOT, "data", "items.json"), encoding="utf-8") as f:
        items = {it["id"]: it for it in json.load(f)}
    out, seen, problems = [], set(), []
    files = sorted(fn for fn in os.listdir(SRC) if fn.endswith(".json")) if os.path.isdir(SRC) else []
    for fn in files:
        with open(os.path.join(SRC, fn), encoding="utf-8") as f:
            raw_list = json.load(f)
        for r in raw_list:
            qid = r["id"]
            if qid in seen:
                problems.append(f"{fn}: id 중복 {qid}")
            seen.add(qid)
            ev = [items[e] for e in r["ev"] if e in items]
            missing = [e for e in r["ev"] if e not in items]
            if missing:
                problems.append(f"{qid}: 없는 근거 {missing}")
            if not ev:
                continue
            unit = ev[0]["unit"]
            level = "red" if all(i["level"] == "red" for i in ev) else "blue"
            pages = [i["page"] for i in ev if i["source"] == "textbook"]
            hand = []
            for i in ev:
                if i["source"] == "handout":
                    name = i.get("handout", "유인물").split(" · ")[0]
                    if name not in hand:
                        hand.append(name)
            src = []
            if pages:
                src.append("교과서 " + pages_text(pages))
            if hand:
                src.append("유인물 " + ", ".join(hand))
            q = {
                "id": qid, "unit": unit, "type": r["t"], "stem": r["s"],
            }
            if r.get("bx"):
                q["boxes"] = r["bx"]
            q.update({
                "choices": r["c"], "answer": r["a"], "explanation": r["e"],
                "evidence": r["ev"], "level": level, "star": any(i.get("star") for i in ev),
                "source": " · ".join(src),
            })
            if r["t"] == "combo" or r.get("noshuffle"):
                q["shuffle"] = False
            out.append(q)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    by_unit = {}
    for q in out:
        by_unit[q["unit"]] = by_unit.get(q["unit"], 0) + 1
    print(f"문제 {len(out)}개 →", ", ".join(f"{u.split('.')[0]} {n}" for u, n in by_unit.items()))
    for p in problems:
        print("문제점:", p)


if __name__ == "__main__":
    main()
