
#!/usr/bin/env python3
import sys, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MD_LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")

def slugify(h: str) -> str:
    s = h.strip().lower()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"\s+", "-", s)
    return s

def load_anchors(md_path: Path):
    anchors = set()
    for line in md_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            title = line.lstrip('#').strip()
            anchors.add('#' + slugify(title))
    return anchors

def check_file(md: Path):
    text = md.read_text(encoding="utf-8")
    ok = True
    for m in MD_LINK.finditer(text):
        target = m.group(2)
        if target.startswith('http'):
            continue
        if '#' in target:
            path_part, anchor = target.split('#', 1)
            anchor = '#' + anchor
        else:
            path_part, anchor = target, None
        target_path = (md.parent / path_part).resolve()
        if not target_path.exists():
            print(f"❌ Missing file: {target} referenced in {md}")
            ok = False
            continue
        if anchor:
            anchors = load_anchors(target_path)
            if anchor not in anchors:
                print(f"❌ Missing anchor {anchor} in {target_path} (from {md})")
                ok = False
    return ok

def main():
    ok = True
    for md in ROOT.rglob('*.md'):
        if '.git' in str(md):
            continue
        if not check_file(md):
            ok = False
    print('✅ Doc links ok' if ok else '❌ Doc link issues')
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
