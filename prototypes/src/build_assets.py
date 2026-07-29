import base64, io, json
from PIL import Image, ImageOps, ImageChops

SRC = r"C:\Users\wyatt\source\repos\pharos-academy-site\docs\mirror\assets"
out = {}

def enc(img, fmt, **kw):
    buf = io.BytesIO()
    img.save(buf, fmt, **kw)
    b = buf.getvalue()
    mime = {"WEBP": "image/webp", "PNG": "image/png", "JPEG": "image/jpeg"}[fmt]
    return f"data:{mime};base64,{base64.b64encode(b).decode()}", len(b)

# --- 1. the Pharos of Alexandria engraving ---
eng = Image.open(SRC + r"\cecb9d_46661c373a624be8a682d16ef80e5074~mv2.png").convert("L")
eng = eng.resize((1200, int(1200 * eng.height / eng.width)), Image.LANCZOS)
# light-ground version: plain grayscale
d, n = enc(eng.convert("RGB"), "WEBP", quality=72, method=6)
out["engraving_light"] = d
print("engraving_light", n // 1024, "KB")
# dark-ground version: ink becomes alpha, RGB flat white -> tint with CSS via opacity/blend
alpha = ImageChops.invert(eng)
alpha = alpha.point(lambda v: min(255, int(v * 1.35)))
ink = Image.new("RGBA", eng.size, (255, 255, 255, 0))
ink.putalpha(alpha)
d, n = enc(ink, "WEBP", quality=70, method=6)
out["engraving_ink"] = d
print("engraving_ink", n // 1024, "KB")
# mask version for variant D: the scan's ground is ~215-234, not white, so a
# multiply blend always leaves a faint rectangle. Drive the ground fully to
# zero alpha instead and use the result as a CSS mask over a flat ink fill.
mask_a = eng.point(lambda v: 0 if v >= 200 else min(255, int((200 - v) * 255 / 150)))
mask = Image.new("RGBA", eng.size, (0, 0, 0, 0))
mask.putalpha(mask_a)
d, n = enc(mask, "PNG", optimize=True)
out["engraving_mask"] = d
print("engraving_mask", n // 1024, "KB", eng.size)

# --- 2. the existing lighthouse mark, background knocked out ---
logo = Image.open(SRC + r"\cecb9d_0ca6169ee8cf426fbc06471e38be23f4~mv2.jpg").convert("RGB")
px = logo.load()
rgba = Image.new("RGBA", logo.size)
rp = rgba.load()
for y in range(logo.height):
    for x in range(logo.width):
        r, g, b = px[x, y]
        m = min(r, g, b)
        a = 255 - m if m > 235 else 255
        if m > 235:
            a = int(max(0, (255 - m) / 20 * 255))
        rp[x, y] = (r, g, b, a)
bbox = rgba.split()[3].getbbox()
rgba = rgba.crop(bbox)
rgba = rgba.resize((480, int(480 * rgba.height / rgba.width)), Image.LANCZOS)
d, n = enc(rgba, "PNG", optimize=True)
out["mark"] = d
print("mark", n // 1024, "KB", rgba.size)

# --- 3. the church building (the only real, face-free school photo we hold) ---
ch = Image.open(SRC + r"\cecb9d_48e58079a244471aa233bc4d0110b4e2~mv2.webp").convert("RGB")
ch = ch.resize((900, int(900 * ch.height / ch.width)), Image.LANCZOS)
d, n = enc(ch, "WEBP", quality=68, method=6)
out["church"] = d
print("church", n // 1024, "KB")

json.dump(out, open("assets.json", "w"))
print("total json", len(json.dumps(out)) // 1024, "KB")
