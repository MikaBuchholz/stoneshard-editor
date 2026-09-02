#!/usr/bin/env python3
"""Read a Stoneshard save file (data.sav, map.sav, ...) and print its contents.

Stoneshard saves are zlib-compressed JSON followed by a 32-character MD5
checksum and a trailing null byte. This script decompresses the file, strips
the checksum, and prints the JSON. No third-party packages are needed.

Usage:
    python3 read_sav.py ~/Downloads/data.sav              # summary of top-level keys
    python3 read_sav.py ~/Downloads/data.sav --full       # print the entire JSON
    python3 read_sav.py ~/Downloads/data.sav --key characterDataMap
    python3 read_sav.py ~/Downloads/data.sav --json out.json   # write decoded JSON to a file
"""

import argparse
import json
import sys
import zlib
from pathlib import Path

CHECKSUM_LENGTH = 32  # MD5 hex digest


def decode_save(path: Path) -> tuple[dict, str]:
    """Return the parsed JSON and the checksum stored in the save file."""
    raw = path.read_bytes()
    try:
        payload = zlib.decompress(raw)
    except zlib.error as error:
        sys.exit(
            f"{path} is not a zlib stream ({error}).\n"
            f"First bytes: {raw[:16].hex(' ')}"
        )

    body = payload.rstrip(b"\x00")
    checksum = body[-CHECKSUM_LENGTH:].decode("ascii", errors="replace")
    json_text = body[:-CHECKSUM_LENGTH].decode("utf-8")
    return json.loads(json_text), checksum



def describe(value) -> str:
    if isinstance(value, dict):
        return f"object with {len(value)} keys"
    if isinstance(value, list):
        return f"list of {len(value)} items"
    text = json.dumps(value)
    return text if len(text) <= 60 else text[:57] + "..."


def print_summary(data: dict) -> None:
    print(f"Top-level keys: {len(data)}")
    print()
    width = max(len(key) for key in data) if data else 0
    for key, value in data.items():
        print(f"  {key:<{width}}  {describe(value)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("path", type=Path, help="path to the .sav file")
    parser.add_argument("--full", action="store_true", help="print the whole JSON, pretty-printed")
    parser.add_argument("--key", help="print only this top-level key, pretty-printed")
    parser.add_argument("--json", type=Path, help="write the decoded JSON to this file")
    args = parser.parse_args()

    if not args.path.is_file():
        sys.exit(f"File not found: {args.path}")

    data, stored_checksum = decode_save(args.path)

    if args.json:
        args.json.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        print(f"Wrote decoded JSON to {args.json}")

    if args.key:
        if args.key not in data:
            sys.exit(f"Key {args.key!r} not found. Available: {', '.join(data)}")
        print(json.dumps(data[args.key], indent=2, ensure_ascii=False))
        return

    if args.full:
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return

    print(f"File:     {args.path}")
    print(f"Checksum: {stored_checksum}")
    print()
    print_summary(data)
    print()
    print("Use --full, --key <name>, or --json <file> to see the data itself.")


if __name__ == "__main__":
    main()
