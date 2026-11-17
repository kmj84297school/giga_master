"""검수 페이지(review.html)에 쓸 사진 조각을 만든다.

- data/items.json 에서 confidence가 "low"인 항목마다 원본 사진의 region 부분을 잘라
  review/crops/<id>.jpg 로 저장한다(주변이 조금 보이게 여백을 둔다).
- work/excluded.json(지운 흔적으로 보고 뺀 곳)도 review/crops/ex-<번호>.jpg 로 자른다.
- 위 사진들의 전체 모습을 줄여서 review/photos/<파일 이름> 으로 저장한다(“사진 전체 보기”용).

사용법 (프로젝트 루트에서)
  python -I tools/make_review.py
  python -I tools/make_review.py --sheet <폴더>   # 조각 모아보기(위치 확인용)도 만듦
"""
import sys
import site

sys.path.append(site.getusersitepackages())

import argparse
import json
import os

from PIL import Image, ImageOps, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CROPS = os.path.join(ROOT, "review", "crops")
PHOTOS = os.path.join(ROOT, "review", "photos")
PAD = 0.03          # region 바깥으로 둘 여백(사진 크기에 대한 비율)
CROP_MAX = (1100, 900)
PHOTO_MAX = 1600


def load_upright(path, rot):
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    if rot:
        im = im.rotate(-rot, expand=True)
    return im


def fit(im, max_w, max_h):
    s = min(1.0, max_w / im.width, max_h / im.height)
    if s < 1.0:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    return im


def padded_box(region, w, h):
    if not region:
        return (0, 0, w, h)
    x0, y0, x1, y1 = region
    x0, y0 = max(0.0, x0 - PAD), max(0.0, y0 - PAD)
    x1, y1 = min(1.0, x1 + PAD), min(1.0, y1 + PAD)
    return (round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h))


def jobs_from_data():
    with open(os.path.join(ROOT, "data", "items.json"), encoding="utf-8") as f:
        items = json.load(f)
    jobs = []
    for it in items:
        if it.get("confidence") == "low":
            jobs.append({"name": it["id"], "source": it["source"], "file": it["file"],
                         "rot": it.get("rot", 0), "region": it.get("region"), "label": it["text"]})
    ex_path = os.path.join(ROOT, "work", "excluded.json")
    if os.path.exists(ex_path):
        with open(ex_path, encoding="utf-8") as f:
            for n, ex in enumerate(json.load(f)):
                jobs.append({"name": f"ex-{n}", "source": ex["source"], "file": ex["file"],
                             "rot": ex.get("rot", 0), "region": ex.get("region"), "label": ex["text"]})
    return jobs


def make_sheets(jobs, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    try:
        font = ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", 17)
    except OSError:
        font = ImageFont.load_default()
    cols, rows, tw, th = 3, 4, 520, 440
    per = cols * rows
    for s in range(0, len(jobs), per):
        chunk = jobs[s:s + per]
        sheet = Image.new("RGB", (cols * tw, ((len(chunk) + cols - 1) // cols) * th), "white")
        d = ImageDraw.Draw(sheet)
        for i, job in enumerate(chunk):
            x, y = (i % cols) * tw, (i // cols) * th
            im = Image.open(os.path.join(CROPS, job["name"] + ".jpg"))
            im.thumbnail((tw - 10, th - 58), Image.LANCZOS)
            sheet.paste(im, (x + 5, y + 54))
            d.text((x + 6, y + 4), job["name"], fill="black", font=font)
            d.text((x + 6, y + 26), job["label"][:30], fill=(90, 90, 90), font=font)
            d.rectangle((x, y, x + tw - 1, y + th - 1), outline=(200, 200, 200))
        p = os.path.join(out_dir, f"review_sheet_{s // per:02d}.jpg")
        sheet.save(p, quality=85)
        print(p)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", help="조각 모아보기를 저장할 폴더")
    a = ap.parse_args()

    os.makedirs(CROPS, exist_ok=True)
    os.makedirs(PHOTOS, exist_ok=True)
    jobs = jobs_from_data()
    keep = set()
    by_photo = {}
    for job in jobs:
        by_photo.setdefault((job["source"], job["file"], job["rot"]), []).append(job)
    for (source, fn, rot), group in by_photo.items():
        im = load_upright(os.path.join(ROOT, "raw", source, fn), rot)
        fit(im, PHOTO_MAX, PHOTO_MAX).save(os.path.join(PHOTOS, fn), quality=80)
        keep.add(("photos", fn))
        for job in group:
            tile = fit(im.crop(padded_box(job["region"], im.width, im.height)), *CROP_MAX)
            tile.save(os.path.join(CROPS, job["name"] + ".jpg"), quality=84)
            keep.add(("crops", job["name"] + ".jpg"))
    # 이제 검수 대상이 아닌 조각은 지운다(검수 반영 뒤 다시 실행했을 때)
    for sub, folder in (("crops", CROPS), ("photos", PHOTOS)):
        for fn in os.listdir(folder):
            if (sub, fn) not in keep:
                os.remove(os.path.join(folder, fn))
    print(f"조각 {sum(1 for k in keep if k[0] == 'crops')}개, 전체 사진 {sum(1 for k in keep if k[0] == 'photos')}장")
    if a.sheet:
        make_sheets(jobs, a.sheet)


if __name__ == "__main__":
    main()
