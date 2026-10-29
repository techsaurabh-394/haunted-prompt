# Copyright (c) 2026 Saurabh Pathak. MIT License.
"""Validate every SVG in assets/: well-formed XML, an <svg> root with width/height/viewBox,
a <title>, no external references, and no font size under 12px. Usage: python3 scripts/validate_svg.py"""
import glob
import re
import sys
import xml.dom.minidom

problems = 0
files = sorted(glob.glob("assets/*.svg"))
if not files:
    print("No SVG files found in assets/")
    sys.exit(1)
for path in files:
    text = open(path, encoding="utf-8").read()
    try:
        doc = xml.dom.minidom.parseString(text)
    except Exception as err:  # noqa: BLE001
        print(f"FAIL {path}: not well-formed XML ({err})")
        problems += 1
        continue
    root = doc.documentElement
    issues = []
    if root.tagName != "svg":
        issues.append("root element is not <svg>")
    for attr in ("width", "height", "viewBox"):
        if not root.getAttribute(attr):
            issues.append(f"missing {attr}")
    if not doc.getElementsByTagName("title"):
        issues.append("missing <title>")
    if re.search(r'(href|src)\s*=\s*"https?:', text) or "@import" in text:
        issues.append("external reference found")
    for m in re.finditer(r"font:\s*(?:\d+\s+)?(\d+(?:\.\d+)?)px", text):
        if float(m.group(1)) < 12:
            issues.append(f"font size {m.group(1)}px is under 12px")
    if issues:
        problems += 1
        print(f"FAIL {path}: " + "; ".join(issues))
    else:
        print(f"ok   {path}")
sys.exit(1 if problems else 0)
