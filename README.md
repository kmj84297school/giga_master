# 기가 마스터 — 기술·가정 시험 대비

교과서·유인물 사진에 펜으로 표시한 내용을 그대로 옮겨, **공부 앱(태블릿)**과 **퀴즈 앱(폰)**으로 만든 것.

- 열기(GitHub Pages): https://kmj84297school.github.io/giga_master/
  - `#study` 공부 앱, `#quiz` 퀴즈 앱, `#home` 처음 화면
  - 폰·태블릿 브라우저 메뉴에서 **홈 화면에 추가**하면 앱처럼 열리고, 인터넷이 없어도 마지막으로 받은 내용으로 열린다.
- 기록: GitHub Pages에서는 **기기마다 따로** 브라우저에 저장된다(기기끼리 연동 없음).
  같은 기기 안에서는 퀴즈에서 틀린 문제의 근거 항목이 공부 앱에 **약점**으로 뜬다.
- 예전 claude.ai 아티팩트 링크(https://claude.ai/artifact/5KB8G5haUJxhMbNwUjbYQd)는 claude.ai 계정으로 기기끼리 기록이 맞춰지는 버전이다.

## 폴더

| 위치 | 내용 |
|---|---|
| `raw/textbook/`, `raw/handout/` | 원본 사진 |
| `work/parts/*.json` | 사진 한 장마다의 판독 결과(손으로 쓴 원본) |
| `work/skip.json` | 판독은 했지만 items.json에 넣지 않는 항목과 이유 |
| `work/excluded.json` | 지운 흔적으로 보고 뺀 곳(검수 페이지에 나옴) |
| `work/qsrc/*.json` | 문제 원본(단원별, 짧은 키) |
| `data/items.json` | 판독 항목 — 두 앱이 같이 쓴다 |
| `data/questions.json` | 문제 — `build_questions.py`가 만든다 |
| `data/units.json` | 단원 순서와 쪽 범위 |
| `web/page.html`, `web/app.js`, `web/figures.js` | 앱 원본(화면·스타일·동작·표그림) |
| `index.html`, `sw.js` | `tools/build_site.py`가 만드는 배포 파일 — 직접 고치지 않는다 |
| `manifest.webmanifest`, `icons/` | 홈 화면에 추가할 때의 이름과 아이콘 |
| `review.html`, `review/` | 판독 검수 페이지와 사진 조각 |
| `tools/` | 스크립트(아래) |

## 판독 규칙(요약)

- 교과서: 빨간 밑줄·동그라미·빨간 손글씨 → red, 파란 밑줄 → blue, 표시 없음 → 제외.
  검은 밑줄이 겹친 곳·뭉개 지운 곳은 지운 것으로 본다. 빨강·파랑이 섞이면 더 긴 색, 비슷하면 red + 검수 목록.
- 유인물: 빨간 표시 → red, `제도규칙-` 4개 절은 전부 red, 나머지는 blue.
- ☆은 등급을 바꾸지 않는다. ☆이 붙은 그 항목 하나만 `star: true`
  (제목 옆 ☆이면 그 제목을 나타내는 묶음 항목). 제목 아래 딸린 항목은 `title_star: true`로 기록만 한다.
- 읽기 어려운 손글씨는 건너뛴다(밑줄 친 내용과 같으므로). 애매한 것은 `confidence: "low"`.
- 자료에 있는 내용만 쓴다. id는 한번 정하면 바꾸지 않는다(문제 id도 마찬가지 — 기록이 id에 붙어 있다).

## 사진을 더 넣을 때 (자료 추가 절차)

1. 새 사진을 `raw/textbook/` 또는 `raw/handout/`에 넣고 Claude에게 파일 이름(순서)을 알려 준다.
2. Claude가 **새 사진만** 판독해 사진마다 `work/parts/<사진>.json`을 만든다(같은 규칙).
3. 새 항목만 이어 붙인다 — 기존 항목과 검수한 내용은 그대로 남는다.
   ```bash
   python -I tools/merge_parts.py
   ```
   새 단원(예: II단원)이 생기면 `data/units.json`에 단원과 쪽 범위를 먼저 넣는다.
4. 확실하지 않은 항목 검수
   ```bash
   python -I tools/make_review.py
   python -I tools/review_server.py
   ```
   브라우저에서 http://127.0.0.1:8765/review.html → 고친 내용은 바로 `work/review_result.json`에 저장된다.
   다 끝나면 Claude에게 “검수 끝”이라고 말한다. Claude가 먼저 바뀔 내용을 보여 주고 반영한다.
   ```bash
   python -I tools/apply_review.py --dry-run
   python -I tools/apply_review.py
   ```
5. 새 red 항목으로 문제를 쓴다(`work/qsrc/<단원>.json`에 이어서, 새 id로). 통째로 외울 표·그림이 있으면 `web/figures.js`에도 추가.
   ```bash
   python -I tools/build_questions.py
   python -I tools/validate.py --coverage
   ```
   `--coverage`: 모든 red 항목이 문제 하나 이상의 근거인지, star 항목은 3문제 이상인지까지 검사한다.
6. 배포 파일을 다시 만들고 GitHub에 올린다. 기기에 쌓인 기록은 그대로 유지된다(문제 id가 그대로라서).
   ```bash
   python -I tools/build_site.py
   git add -A
   git commit -m "사진 추가분 반영"
   git push
   ```
   1~2분 뒤 GitHub Pages에 반영된다. (아티팩트 버전도 고치려면 Claude가 `web/page.html`을 같은 아티팩트 링크로 다시 게시)

> `merge_parts.py --rebuild`는 처음부터 다시 만드는 명령이라 검수 결과가 사라진다. 검수를 반영한 뒤에는 막혀 있다(`--force`로만 가능).

## 스크립트

| 명령 | 하는 일 |
|---|---|
| `tools/crop.py` | 판독할 때 사진을 바로 세우고 확대 조각으로 자른다 |
| `tools/merge_parts.py` | 판독 결과 → `data/items.json`(새 id만 추가, 유인물↔교과서 쪽 연결) |
| `tools/make_review.py` | 검수용 사진 조각 만들기 |
| `tools/review_server.py` | 검수 페이지 서버(고친 내용 저장). `/app`으로 앱도 미리 볼 수 있다 |
| `tools/apply_review.py` | 검수 결과 반영(확인·고침·빼기·되살리기, 원본은 `work/review_applied/`에 보관) |
| `tools/build_questions.py` | 문제 원본 → `data/questions.json`(등급·출처·별표는 근거 항목에서 계산) |
| `tools/validate.py` | 보기 5개, 정답 번호, 근거 id, 중복 id, 가릴 말 등 검사 |
| `tools/build_site.py` | `web/page.html` → GitHub Pages용 `index.html`, 오프라인용 `sw.js`(캐시 버전 자동) |

## GitHub Pages 배포

- 저장소: https://github.com/kmj84297school/giga_master (`main` 브랜치)
- 저장소 **Settings → Pages → Build and deployment**에서 Source: *Deploy from a branch*, Branch: `main` / `(root)`.
- `raw/`(원본 사진)와 `review/`(검수용 사진 조각)는 용량이 커서 저장소에 올리지 않는다(`.gitignore`). 이 컴퓨터에만 있다.
- 로컬에서 미리 보기: `python -I tools/review_server.py` → http://127.0.0.1:8765/ (서비스 워커는 https에서만 켜진다)

## 기록 저장 구조

`web/app.js`의 `Remote` 객체만 연동을 맡는다. 앱의 나머지는 이 기기 저장(localStorage)만 쓴다.
claude.ai 아티팩트 안에서 열리면 아티팩트 저장소로 연동하고, GitHub Pages에서는 연동 없이 기기에만 저장한다.

- 문서: `q-<문제id>` {상자 b, 다음 출제 d, 맞힘 r, 틀림 x, 시각 t, 마지막 결과 l}, `w-<항목id>` {약점 해제 시각 c}, `meta` {파랑 포함, 시험 날짜, mt}
- 같은 문서는 시각이 더 새로운 쪽을 쓴다.
- GitHub Pages + Firebase로 옮기려면 `Remote.start / put / refetch / wipe`를 Firestore 호출로 바꾸면 된다(문서 모양 그대로).
