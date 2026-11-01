# 작은 이미지들을 큰 시트 몇 장으로 합치고(게시 파일 수 줄이기), imgpack.js에 좌표를 기록한다.
# 원본 파일은 저장소에 그대로 두고, 게시할 때는 시트만 올린다. 실행: python3 tools/build_imgpack.py
import glob, json, os
from PIL import Image

GROUPS = {
  'img/pack_icons.webp': ['img/ui/sub_*.png', 'img/skill/*.png', 'img/ui/pot_*.png', 'img/ui/elite_*.png', 'img/ui/pro_*.png',
                          'img/is/ui/*.png', 'img/is/relic/*.png', 'img/is/band_*.png', 'img/is/mutation_*.png', 'img/is/variation_*.png',
                          'img/is/virtue_*.png', 'img/is/evolution_*.png', 'img/is/pill.png', 'img/is/treasure.png'],
  'img/pack_enemy.webp': ['img/enemy/*.png'],
}
# CSS · 배경(url())으로 쓰는 파일은 제외
EXCLUDE = {'img/is/ui/node_bkg.png', 'img/is/ui/node_sel.png', 'img/is/key.png'}
MAXW = 2048

def shelf(items):
    items = sorted(items, key=lambda t: -t[1].height)
    x = y = rowh = 0; out = {}
    for path, im in items:
        if x + im.width > MAXW: x, y, rowh = 0, y + rowh, 0
        out[path] = (x, y, im.width, im.height)
        x += im.width + 1; rowh = max(rowh, im.height + 1)
    return out, y + rowh

pack = {}
for sheet, pats in GROUPS.items():
    files = sorted({f for p in pats for f in glob.glob(p)} - EXCLUDE)
    ims = [(f, Image.open(f).convert('RGBA')) for f in files]
    pos, h = shelf(ims)
    W = max(x + w for x, y, w, hh in pos.values())
    sp = Image.new('RGBA', (W, h), (0, 0, 0, 0))
    for f, im in ims: sp.paste(im, pos[f][:2])
    sp.save(sheet, 'WEBP', lossless=True, method=6)
    pack[sheet] = {f: list(pos[f]) for f, _ in ims}
    print(sheet, len(files), sp.size, os.path.getsize(sheet))
open('imgpack.js', 'w').write(
  "'use strict';\n// 자동 생성: tools/build_imgpack.py — 이미지 경로 → [시트, x, y, w, h]\nwindow.IMGPACK_MAP = " +
  json.dumps({f: [s] + p for s, m in pack.items() for f, p in m.items()}, separators=(',', ':')) + ";\n" + open('tools/imgpack_runtime.js').read())
print('files packed:', sum(len(m) for m in pack.values()))
