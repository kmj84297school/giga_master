"""사진 판독용 자르기 도구.

원본 사진(raw/)을 EXIF 방향대로 바로 세운 뒤, 확대해서 읽을 수 있게 조각으로 자른다.
판독 자체는 사람이/Claude가 눈으로 하고, 이 스크립트는 조각만 만든다.

사용법 (프로젝트 루트에서):
  python -I tools/crop.py sheet  <출력폴더> <사진...>            # 여러 장을 한 장에 모아 보기
  python -I tools/crop.py bands  <출력폴더> <사진> [--n 3] [--rot 0|90|180|270] [--cols 1|2]
  python -I tools/crop.py box    <출력파일> <사진> x0 y0 x1 y1 [--rot ...] [--max 1568]

좌표는 "바로 세운 뒤(+--rot 적용 뒤)" 이미지에서의 비율(0~1)이다.
"""
import sys
import site

# -I(격리 모드)로 실행해도 사용자 site-packages의 Pillow를 쓸 수 있게 한다.
sys.path.append(site.getusersitepackages())

import argparse
import os

from PIL import Image, ImageOps, ImageDraw, ImageEnhance

MAX_SIDE = 1568


def load(path, rot=0):
    im = Image.open(path)
    im = ImageOps.exif_transpose(im).convert("RGB")
    if rot:
        im = im.rotate(-rot, expand=True)  # rot = 시계 방향 각도
    return im


def fit(im, max_side=MAX_SIDE):
    w, h = im.size
    s = min(1.0, max_side / max(w, h))
    if s < 1.0:
        im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    return im


def cmd_sheet(a):
    os.makedirs(a.out, exist_ok=True)
    per = a.per
    cols = a.cols
    tw, th = a.tw, a.th
    for i in range(0, len(a.files), per):
        chunk = a.files[i:i + per]
        rows = (len(chunk) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * tw, rows * th), "white")
        d = ImageDraw.Draw(sheet)
        for j, f in enumerate(chunk):
            im = load(f, a.rot)
            im.thumbnail((tw - 8, th - 28), Image.LANCZOS)
            x, y = (j % cols) * tw + 4, (j // cols) * th + 24
            sheet.paste(im, (x, y))
            name = os.path.basename(f).replace("KakaoTalk_20261115_", "").replace(".jpg", "")
            d.text((x, y - 20), f"{name}  {im.size}", fill="black")
        p = os.path.join(a.out, f"sheet_{i // per:02d}.jpg")
        sheet.save(p, quality=85)
        print(p)


def cmd_bands(a):
    os.makedirs(a.out, exist_ok=True)
    im = load(a.file, a.rot)
    w, h = im.size
    x0, x1 = round(a.x0 * w), round(a.x1 * w)
    y0, y1 = round(a.y0 * h), round(a.y1 * h)
    im = im.crop((x0, y0, x1, y1))
    w, h = im.size
    base = os.path.basename(a.file).replace("KakaoTalk_20261115_", "").replace(".jpg", "")
    n, cols = a.n, a.cols
    ov = 0.06
    bh = h / n
    cw = w / cols
    for r in range(n):
        for c in range(cols):
            top = max(0, round(r * bh - ov * bh))
            bot = min(h, round((r + 1) * bh + ov * bh))
            left = max(0, round(c * cw - ov * cw))
            right = min(w, round((c + 1) * cw + ov * cw))
            tile = fit(im.crop((left, top, right, bot)), a.max)
            if a.sat:
                tile = ImageEnhance.Color(tile).enhance(a.sat)
            tag = f"{a.tag}_" if a.tag else ""
            p = os.path.join(a.out, f"{base}_{tag}r{r}c{c}.jpg")
            tile.save(p, quality=90)
            print(p, tile.size)


def cmd_box(a):
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    im = load(a.file, a.rot)
    w, h = im.size
    box = (round(a.x0 * w), round(a.y0 * h), round(a.x1 * w), round(a.y1 * h))
    tile = im.crop(box)
    if a.up and max(tile.size) < a.max:
        s = min(a.up, a.max / max(tile.size))
        tile = tile.resize((round(tile.size[0] * s), round(tile.size[1] * s)), Image.LANCZOS)
    tile = fit(tile, a.max)
    if a.sat:
        # 펜 색(빨강/파랑/검정)을 구분하기 쉽게 채도를 올린다.
        tile = ImageEnhance.Color(tile).enhance(a.sat)
    tile.save(a.out, quality=92)
    print(a.out, tile.size, "px box", box)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("sheet")
    s.add_argument("out")
    s.add_argument("files", nargs="+")
    s.add_argument("--per", type=int, default=8)
    s.add_argument("--cols", type=int, default=4)
    s.add_argument("--tw", type=int, default=480)
    s.add_argument("--th", type=int, default=660)
    s.add_argument("--rot", type=int, default=0)
    s.set_defaults(fn=cmd_sheet)

    b = sub.add_parser("bands")
    b.add_argument("out")
    b.add_argument("file")
    b.add_argument("--n", type=int, default=3)
    b.add_argument("--cols", type=int, default=1)
    b.add_argument("--rot", type=int, default=0)
    b.add_argument("--max", type=int, default=MAX_SIDE)
    b.add_argument("--x0", type=float, default=0.0)
    b.add_argument("--x1", type=float, default=1.0)
    b.add_argument("--y0", type=float, default=0.0)
    b.add_argument("--y1", type=float, default=1.0)
    b.add_argument("--tag", default="")
    b.add_argument("--sat", type=float, default=0.0, help="채도 배율(펜 색 구분용)")
    b.set_defaults(fn=cmd_bands)

    x = sub.add_parser("box")
    x.add_argument("out")
    x.add_argument("file")
    x.add_argument("x0", type=float)
    x.add_argument("y0", type=float)
    x.add_argument("x1", type=float)
    x.add_argument("y1", type=float)
    x.add_argument("--rot", type=int, default=0)
    x.add_argument("--max", type=int, default=MAX_SIDE)
    x.add_argument("--up", type=float, default=0.0, help="작은 조각을 이 배율까지 키움")
    x.add_argument("--sat", type=float, default=0.0, help="채도 배율(펜 색 구분용, 예: 3)")
    x.set_defaults(fn=cmd_box)

    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
