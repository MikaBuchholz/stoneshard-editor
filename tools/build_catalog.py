#!/usr/bin/env python3
"""Build the item catalog and sprite set for the save editor from Stoneshard's data.win.

Usage:
    python3 tools/build_catalog.py /path/to/data.win

Writes app/public/catalog/items.json and app/public/sprites/<key>.png.
Re-run after every game update. Requires Pillow (pip install pillow).
"""

import bz2
import json
import re
import struct
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image

CELL_PIXELS = 27
ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = ROOT / "app" / "public" / "catalog" / "items.json"
SPRITES_DIR = ROOT / "app" / "public" / "sprites"

ITEM_HEADER = "id;;Price;EffPrice"
WEAPON_HEADER = "name;Tier;id;Slot;Subtype"
ARMOR_HEADER = "name;Tier;id;Slot;class"
LOCALIZATION_COLUMNS = 13
HIDDEN_CATEGORIES = {"quest", "flag", "None"}
# Table columns that describe the item rather than a stat the game copies onto the record.
EQUIPMENT_META_COLUMNS = {
    "name", "Tier", "id", "Slot", "Subtype", "altGrip", "rarity", "Mat", "Price", "Markup", "MaxDuration", "Rng",
    "Balance", "tags", "upgrade", "fireproof", "NoDrop", "audio", "class", "IsOpen", "visorSwitch",
}


class GameData:
    """Minimal reader for the GameMaker data.win container: chunks, strings, sprites, objects, textures."""

    def __init__(self, path: Path):
        self.data = path.read_bytes()
        if self.data[:4] != b"FORM":
            sys.exit(f"{path} is not a GameMaker data.win file")
        self.chunks = self._read_chunks()
        self.strings = self._read_strings()

    def _read_chunks(self):
        chunks = {}
        position = 8
        while position < len(self.data):
            name = self.data[position : position + 4].decode()
            size = struct.unpack_from("<I", self.data, position + 4)[0]
            chunks[name] = position + 8
            position += 8 + size
        return chunks

    def _pointer_list(self, chunk: str):
        offset = self.chunks[chunk]
        count = struct.unpack_from("<I", self.data, offset)[0]
        return struct.unpack_from(f"<{count}I", self.data, offset + 4)

    def _string_at(self, pointer: int) -> str:
        length = struct.unpack_from("<I", self.data, pointer - 4)[0]
        return self.data[pointer : pointer + length].decode("utf-8", "replace")

    def _read_strings(self):
        strings = []
        for pointer in self._pointer_list("STRG"):
            length = struct.unpack_from("<I", self.data, pointer)[0]
            strings.append(self.data[pointer + 4 : pointer + 4 + length].decode("utf-8", "replace"))
        return strings

    def objects(self):
        """Yield (name, sprite_index, parent_index) for every game object."""
        pointers = self._pointer_list("OBJT")
        for pointer in pointers:
            name = self._string_at(struct.unpack_from("<I", self.data, pointer)[0])
            sprite_index, = struct.unpack_from("<i", self.data, pointer + 4)
            parent_index, = struct.unpack_from("<i", self.data, pointer + 24)
            yield name, sprite_index, parent_index

    def sprites(self):
        """Return a list of (name, width, height, first_frame_tpag_pointer) in sprite index order."""
        result = []
        for pointer in self._pointer_list("SPRT"):
            name = self._string_at(struct.unpack_from("<I", self.data, pointer)[0])
            width, height = struct.unpack_from("<II", self.data, pointer + 4)
            cursor = pointer + 4 * 14
            marker = struct.unpack_from("<i", self.data, cursor)[0]
            if marker == -1:
                cursor += 4
                version, sprite_type = struct.unpack_from("<II", self.data, cursor)
                cursor += 8 + 8  # playback speed + playback type
                if version >= 2:
                    cursor += 4  # sequence pointer
                if version >= 3:
                    cursor += 4  # nine-slice pointer
                if sprite_type != 0:
                    result.append((name, width, height, None))
                    continue
            frame_count = struct.unpack_from("<I", self.data, cursor)[0]
            first_frame = struct.unpack_from("<I", self.data, cursor + 4)[0] if frame_count else None
            result.append((name, width, height, first_frame))
        return result

    def texture_page_entry(self, tpag_pointer: int):
        fields = struct.unpack_from("<11H", self.data, tpag_pointer)
        keys = ("source_x", "source_y", "source_w", "source_h", "target_x", "target_y", "target_w", "target_h", "bound_w", "bound_h", "texture")
        return dict(zip(keys, fields))

    def texture_pages(self):
        return [struct.unpack_from("<7I", self.data, pointer)[6] for pointer in self._pointer_list("TXTR")]

    def decode_texture(self, data_pointer: int) -> Image.Image:
        magic, width, height, compressed_length = struct.unpack_from("<4sHHI", self.data, data_pointer)
        if magic != b"2zoq":
            raise ValueError(f"unsupported texture format {magic!r}")
        payload = bz2.decompress(self.data[data_pointer + 12 : data_pointer + 12 + compressed_length])
        return decode_qoi(payload)


def decode_qoi(payload: bytes) -> Image.Image:
    """Decode GameMaker's QOI variant: a 'fioq' header, then the pre-1.0 QOI draft opcodes with RGBA pixels."""
    magic, width, height, length = struct.unpack_from("<4sHHI", payload, 0)
    if magic != b"fioq":
        raise ValueError(f"unsupported image format {magic!r}")
    pixels = bytearray(width * height * 4)
    index = [(0, 0, 0, 0)] * 64
    red = green = blue = 0
    alpha = 255
    cursor = 12
    end = 12 + length
    out = 0
    total = width * height * 4
    run = 0
    while out < total:
        if run > 0:
            run -= 1
        elif cursor < end:
            tag = payload[cursor]
            cursor += 1
            if tag & 0xC0 == 0x00:
                red, green, blue, alpha = index[tag & 0x3F]
            elif tag & 0xE0 == 0x40:
                run = tag & 0x1F
            elif tag & 0xE0 == 0x60:
                run = (((tag & 0x1F) << 8) | payload[cursor]) + 32
                cursor += 1
            elif tag & 0xC0 == 0x80:
                red = (red + signed((tag >> 4) & 3, 2)) & 0xFF
                green = (green + signed((tag >> 2) & 3, 2)) & 0xFF
                blue = (blue + signed(tag & 3, 2)) & 0xFF
            elif tag & 0xE0 == 0xC0:
                second = payload[cursor]
                cursor += 1
                red = (red + signed(tag & 0x1F, 5)) & 0xFF
                green = (green + signed(second >> 4, 4)) & 0xFF
                blue = (blue + signed(second & 0x0F, 4)) & 0xFF
            elif tag & 0xF0 == 0xE0:
                second, third = payload[cursor], payload[cursor + 1]
                cursor += 2
                red = (red + signed(((tag & 0x0F) << 1) | (second >> 7), 5)) & 0xFF
                green = (green + signed((second & 0x7C) >> 2, 5)) & 0xFF
                blue = (blue + signed(((second & 0x03) << 3) | ((third & 0xE0) >> 5), 5)) & 0xFF
                alpha = (alpha + signed(third & 0x1F, 5)) & 0xFF
            else:
                if tag & 8:
                    red = payload[cursor]
                    cursor += 1
                if tag & 4:
                    green = payload[cursor]
                    cursor += 1
                if tag & 2:
                    blue = payload[cursor]
                    cursor += 1
                if tag & 1:
                    alpha = payload[cursor]
                    cursor += 1
            index[(red ^ green ^ blue ^ alpha) % 64] = (red, green, blue, alpha)
        else:
            break
        pixels[out : out + 4] = bytes((red, green, blue, alpha))
        out += 4
    return Image.frombytes("RGBA", (width, height), bytes(pixels))


def signed(value: int, bits: int) -> int:
    """Interpret the low `bits` of value as a two's complement number."""
    return value - (1 << bits) if value & (1 << (bits - 1)) else value


def split_row(row: str):
    return row.split(";")


def table_rows(strings, header: str):
    """Rows of a semicolon table are scattered through the string pool; match them by column count."""
    header_row = next(s for s in strings if s.startswith(header))
    columns = split_row(header_row)
    count = len(columns)
    rows = [split_row(s) for s in strings if s.count(";") == count - 1 and s != header_row]
    return columns, rows


def row_dict(columns, row):
    return {name: value for name, value in zip(columns, row) if name and value}


def english_name_candidates(strings):
    """Every short English string per localization key; several tables share the 13-column layout."""
    cyrillic = re.compile(r"[Ѐ-ӿ]")
    candidates = defaultdict(list)
    for text in strings:
        if text.count(";") != LOCALIZATION_COLUMNS:
            continue
        parts = split_row(text)
        key, russian, english = parts[0], parts[1], parts[2]
        if not (key and russian and english and cyrillic.search(russian)):
            continue
        if len(english) > 60 or english.endswith(".") or "~" in english or "#" in english:
            continue
        candidates[key].append(english)
    return candidates


def english_names(strings):
    """Pick the English display name per key: shortest capitalized candidate."""
    names = {}
    for key, options in english_name_candidates(strings).items():
        capitalized = [option for option in options if option[:1].isupper()]
        names[key] = min(capitalized or options, key=len)
    return names


def sprite_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def file_key(key: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", key)


def build(data_path: Path):
    game = GameData(data_path)
    strings = game.strings
    names = english_names(strings)
    sprites = game.sprites()
    sprites_by_key = {sprite_key(name[6:]): position for position, (name, *_rest) in enumerate(sprites) if name.startswith("s_inv_")}

    object_rows = list(game.objects())
    object_names = [row[0] for row in object_rows]
    inventory_objects = {}
    for name, sprite_index, parent_index in object_rows:
        if not name.startswith("o_inv_"):
            continue
        parent = object_names[parent_index] if 0 <= parent_index < len(object_names) else None
        if parent != "o_damage_dealer":
            continue
        inventory_objects[name[6:]] = sprite_index

    entries = []

    item_columns, item_rows = table_rows(strings, ITEM_HEADER)
    stats_by_id = {row[0]: row_dict(item_columns, row) for row in item_rows}
    for object_id, sprite_index in inventory_objects.items():
        stats = stats_by_id.get(object_id, {})
        tags = stats.get(item_columns[-2], "")  # rarity-like tag sits in the second-to-last column
        category = stats.get("Cat", "")
        hidden = (
            not stats
            or object_id not in names
            or object_id.endswith("_parent")
            or category in HIDDEN_CATEGORIES
        )
        entries.append({
            "key": object_id,
            "kind": "object",
            "objectName": f"o_inv_{object_id}",
            "name": names.get(object_id, object_id.replace("_", " ").title()),
            "category": category,
            "subcategory": stats.get("Subcat", ""),
            "material": stats.get("Material", ""),
            "tags": tags,
            "price": to_number(stats.get("Price")),
            "stacks": to_number(stats.get("Stacks")) or to_number(stats.get("stack")),
            "fresh": to_number(stats.get("Fresh")),
            "effectDuration": to_number(stats.get("Duration")),
            "container": category in ("bag", "backpack") or bool(stats.get("is_container")) or bool(stats.get("purse")),
            "hidden": hidden,
            "spriteIndex": sprite_index if sprite_index >= 0 else None,
        })

    for kind, header in (("weapon", WEAPON_HEADER), ("armor", ARMOR_HEADER)):
        columns, rows = table_rows(strings, header)
        for row in rows:
            if not (row[2] and row[1].isdigit()):
                continue
            record = row_dict(columns, row)
            name = row[0]
            stats = {
                column: to_number(value)
                for column, value in record.items()
                if column not in EQUIPMENT_META_COLUMNS and not column.startswith("fragment_") and to_number(value) is not None
            }
            entries.append({
                "key": name,
                "kind": kind,
                "id": record.get("id", ""),
                "name": names.get(name, name),
                "category": kind,
                "subcategory": record.get("Slot", ""),
                "slot": record.get("Slot", ""),
                "armorClass": record.get("class", ""),
                "material": record.get("Mat", ""),
                "tags": record.get("tags", ""),
                "rarity": record.get("rarity", ""),
                "tier": to_number(record.get("Tier")),
                "price": to_number(record.get("Price")),
                "maxDuration": to_number(record.get("MaxDuration")),
                "range": to_number(record.get("Rng")),
                "stats": stats,
                "hidden": name not in names,
                "spriteIndex": sprites_by_key.get(sprite_key(name)),
            })

    write_sprites(game, sprites, entries)

    catalog = {
        "cellPixels": CELL_PIXELS,
        "source": data_path.name,
        "items": sorted(entries, key=lambda entry: entry["name"].lower()),
    }
    CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_PATH.write_text(json.dumps(catalog, indent=0, ensure_ascii=False))
    visible = sum(1 for entry in entries if not entry["hidden"])
    with_sprite = sum(1 for entry in entries if entry.get("sprite"))
    print(f"catalog: {len(entries)} entries, {visible} visible, {with_sprite} with sprites -> {CATALOG_PATH}")


def write_sprites(game: GameData, sprites, entries):
    SPRITES_DIR.mkdir(parents=True, exist_ok=True)
    page_pointers = game.texture_pages()
    decoded_pages = {}
    for entry in entries:
        sprite_index = entry.pop("spriteIndex")
        if sprite_index is None or not (0 <= sprite_index < len(sprites)):
            entry["w"] = entry["h"] = 1
            continue
        name, width, height, frame = sprites[sprite_index]
        entry["w"] = max(1, round(width / CELL_PIXELS))
        entry["h"] = max(1, round(height / CELL_PIXELS))
        if frame is None:
            continue
        frame_info = game.texture_page_entry(frame)
        page_index = frame_info["texture"]
        if page_index not in decoded_pages:
            decoded_pages[page_index] = game.decode_texture(page_pointers[page_index])
        page = decoded_pages[page_index]
        image = Image.new("RGBA", (frame_info["bound_w"], frame_info["bound_h"]), (0, 0, 0, 0))
        crop = page.crop((
            frame_info["source_x"],
            frame_info["source_y"],
            frame_info["source_x"] + frame_info["source_w"],
            frame_info["source_y"] + frame_info["source_h"],
        ))
        image.paste(crop, (frame_info["target_x"], frame_info["target_y"]))
        file_name = f"{file_key(entry['key'])}.png"
        image.save(SPRITES_DIR / file_name, optimize=True)
        entry["sprite"] = file_name


def to_number(value):
    if value in (None, ""):
        return None
    try:
        number = float(value)
    except ValueError:
        return None
    return int(number) if number.is_integer() else number


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    build(Path(sys.argv[1]).expanduser())
