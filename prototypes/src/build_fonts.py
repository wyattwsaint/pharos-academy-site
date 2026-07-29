import re, base64, urllib.request, os, glob

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
out = []
total = 0

for path in sorted(glob.glob("fonts/*.css")):
    css = open(path, encoding="utf-8").read()
    # split into /* subset */ @font-face blocks
    blocks = re.findall(r"(/\*\s*([a-z0-9\-]+)\s*\*/\s*@font-face\s*\{(.*?)\})", css, re.S)
    for whole, subset, body in blocks:
        if subset != "latin":
            continue
        fam = re.search(r"font-family:\s*'([^']+)'", body).group(1)
        weight = re.search(r"font-weight:\s*([^;]+);", body).group(1).strip()
        style = re.search(r"font-style:\s*([^;]+);", body).group(1).strip()
        url = re.search(r"url\((https://[^)]+\.woff2)\)", body).group(1)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        data = urllib.request.urlopen(req).read()
        total += len(data)
        b64 = base64.b64encode(data).decode()
        out.append(
            "@font-face{font-family:'%s';font-style:%s;font-weight:%s;font-display:swap;"
            "src:url(data:font/woff2;base64,%s) format('woff2');}" % (fam, style, weight, b64)
        )
        print(f"{fam} {weight} {style}  {len(data)//1024}KB")

open("fonts.css", "w", encoding="utf-8").write("\n".join(out))
print("raw total", total // 1024, "KB; css", os.path.getsize("fonts.css") // 1024, "KB")
