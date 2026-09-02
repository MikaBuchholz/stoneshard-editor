#!/usr/bin/env python3
"""Collect one clean property template per inventory object from real save files.

Usage:
    python3 tools/harvest_templates.py path/to/data.sav [more.sav ...]

Scans every item record in the saves (bag, stash, containers, merchant stock) and writes
app/public/catalog/templates.json mapping idName -> properties as the game creates them.
Per-instance fields (durability wear, timestamps, ownership, container contents) are stripped.
Run it on as many saves as you can; later runs merge into the existing file.
"""

import json
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "app" / "public" / "catalog" / "templates.json"

# Set while playing, not part of what the game creates.
INSTANCE_FIELDS = {"lootList", "Timestamp", "HasOwner", "is_trade_item", "Stolen_Days", "Stolen_Days_Timestamp", "Town", "is_execute", "Stack"}


def load(path: Path) -> dict:
    payload = zlib.decompress(path.read_bytes()).rstrip(b"\0")
    return json.loads(payload[:-32])


def records(node):
    if isinstance(node, list):
        if len(node) == 10 and isinstance(node[0], str) and node[0].startswith("o_inv_") and isinstance(node[1], dict):
            yield node
        for child in node:
            yield from records(child)
    elif isinstance(node, dict):
        for child in node.values():
            yield from records(child)


def clean(properties: dict) -> dict:
    template = {key: value for key, value in properties.items() if key not in INSTANCE_FIELDS}
    if "MaxDuration" in template:
        template["Duration"] = template["MaxDuration"]
    template["identified"] = 1
    template["is_cursed"] = 0
    return template


def main(paths):
    templates = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {}
    seen = 0
    for path in paths:
        for record in records(load(Path(path))):
            seen += 1
            key = record[0][6:]
            properties = record[1]
            if not isinstance(properties.get("idName"), str):
                continue
            is_container = "lootList" in properties
            template = clean(properties)
            if is_container:
                template["Stack"] = 0
                template["lootList"] = []
            # Keep the richest record seen for an item; a merchant's fresh copy beats a used one.
            if key not in templates or len(template) > len(templates[key]):
                templates[key] = template
    OUTPUT.write_text(json.dumps(dict(sorted(templates.items())), ensure_ascii=False, indent=0))
    print(f"scanned {seen} records, {len(templates)} templates -> {OUTPUT}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
