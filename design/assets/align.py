# 화분 몸통의 가장 넓은 줄(배 부분)을 기준으로 이미지들의 크기·위치를 맞춘다.
# 값은 행별 폭 프로파일에서 직접 읽은 것: (원본 파일, 배 y, 배 폭, 배 중심 x, 테두리 y)
import sys, json
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
files = {
    'stage3': ('7.webp', 862, 608, 610, 550),
    'stage3_wilted': ('8.webp', 862, 632, 610, 550),
    'stage1': ('9.webp', 850, 618, 613, 650),
    'stage2': ('13.webp', 875, 586, 620, 620),
    'stage2_wilted': ('14.webp', 875, 586, 620, 620),
    'stage2_watered': ('15.webp', 875, 590, 619, 620),
    'stage4': ('11.webp', 912, 580, 614, 640),
    'stage4_watered': ('16.webp', 875, 592, 620, 620),
}
W = H = 800; BELLY_W = 380; BELLY_Y = 600
meta = {}
for name, (f, by, bw, bx, ry) in files.items():
    im = Image.open(src + f).convert('RGBA')
    s = BELLY_W / bw
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(im, (round(W / 2 - bx * s), round(BELLY_Y - by * s)))
    # 원본의 거의 투명한 배경 잔여물(희미한 사각형)을 지운다.
    canvas.putalpha(canvas.getchannel('A').point(lambda v: 0 if v < 12 else v))
    canvas.save(out + name + '.webp', quality=92, method=6)
    meta[name] = {'rimY': round(BELLY_Y - (by - ry) * s)}
print(json.dumps(meta))
