# 아이콘 묶음 이미지를 칸별로 잘라 정사각형 투명 PNG(webp)로 저장한다.
import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
SIZE = 256

def save(im, box, name):
    crop = im.crop(box)
    a = crop.getchannel('A').point(lambda v: 0 if v < 24 else 255)
    bb = a.getbbox()
    crop = crop.crop(bb)
    side = int(max(crop.size) * 1.08)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.alpha_composite(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    sq = sq.resize((SIZE, SIZE), Image.LANCZOS)
    sq.putalpha(sq.getchannel('A').point(lambda v: 0 if v < 10 else v))
    sq.save(out + name + '.webp', quality=92, method=6)
    print(name, im.mode, box, bb)

nav = Image.open(src + '19.webp').convert('RGBA'); w, h = nav.size
for i, n in enumerate(['nav-today', 'nav-history', 'nav-settings']):
    save(nav, (w * i // 3, 0, w * (i + 1) // 3, h), n)
st = Image.open(src + '20.webp').convert('RGBA'); w, h = st.size
for i, n in enumerate(['stat-left', 'stat-cups', 'stat-streak', 'stat-vit']):
    c, r = i % 2, i // 2
    save(st, (w * c // 2, h * r // 2, w * (c + 1) // 2, h * (r + 1) // 2), n)
d = Image.open(src + '21.webp').convert('RGBA')
save(d, (0, 0) + d.size, 'drop')
