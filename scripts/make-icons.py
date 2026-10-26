"""Create packaged extension icons from a simple shield mark."""
from pathlib import Path
from PIL import Image, ImageDraw

output = Path(__file__).resolve().parents[1] / "public" / "icons"
output.mkdir(parents=True, exist_ok=True)
for size in (16, 32, 48, 128):
    scale = 4
    s = size * scale
    image = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    m = s * 0.07
    draw.rounded_rectangle((m, m, s-m, s-m), radius=s*0.22, fill="#0b6581")
    draw.polygon([(s*.5,s*.16),(s*.78,s*.27),(s*.76,s*.54),(s*.69,s*.72),(s*.5,s*.84),(s*.31,s*.72),(s*.24,s*.54),(s*.22,s*.27)], fill="#e9ffff")
    draw.line([(s*.36,s*.49),(s*.46,s*.59),(s*.66,s*.38)], fill="#0c9e9d", width=max(2,round(s*.065)), joint="curve")
    image.resize((size, size), Image.Resampling.LANCZOS).save(output / f"icon{size}.png")
