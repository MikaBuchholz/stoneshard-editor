#!/usr/bin/env python3
"""Build the skill catalog: every skill object with its English name and icon from data.win,
plus the tree layouts and panel images from the official wiki.

Usage:
    python3 tools/build_skills.py /path/to/data.win

Writes app/public/catalog/skills.json, app/public/skills/<key>.png (small icons) and
app/public/trees/<tree>.png (the wiki's tree panels). Needs network access for the wiki part.
"""

import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

from build_catalog import GameData, english_name_candidates, english_names

ROOT = Path(__file__).resolve().parent.parent
SKILLS_JSON = ROOT / "app" / "public" / "catalog" / "skills.json"
ICONS_DIR = ROOT / "app" / "public" / "skills"
TREES_DIR = ROOT / "app" / "public" / "trees"
WIKI_API = "https://stoneshard.com/wiki/api.php?"
WIKI_RAW = "https://stoneshard.com/w/index.php?"

# Wiki names that match no English string in the game data, mapped to a name that does.
WIKI_ALIASES = {"Berserk Tradition": "Berserker Tradition"}

# Skill keys whose localization string is a message template rather than a name.
NAME_OVERRIDES = {"craft": "Craft"}

# The wiki's grouping of trees, in display order.
TREE_GROUPS = {
    "Weapons": ["Swords", "Axes", "Maces", "Daggers", "Two-Handed Swords", "Two-Handed Axes", "Two-Handed Maces", "Spears", "Ranged Weapons", "Shields", "Staves"],
    "Utility": ["Basic Skills", "Dual Wielding", "Survival", "Warfare", "Athletics", "Magic Mastery", "Armored Combat"],
    "Sorcery": ["Pyromancy", "Geomancy", "Electromancy", "Arcanistics"],
}


def normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def skill_key(object_name: str) -> str:
    if object_name.startswith("o_pass_skill_"):
        return object_name[len("o_pass_skill_"):]
    if object_name.startswith("o_skill_") and object_name.endswith("_ico"):
        return object_name[len("o_skill_"):-len("_ico")]
    return ""


def wiki_get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "stoneshard-save-editor build script"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def wiki_raw(title: str) -> str:
    return wiki_get(WIKI_RAW + urllib.parse.urlencode({"title": title, "action": "raw"})).decode("utf-8", "replace")


def wiki_image_url(file_name: str) -> str | None:
    query = urllib.parse.urlencode({"action": "query", "titles": f"File:{file_name}", "prop": "imageinfo", "iiprop": "url", "format": "json"})
    pages = json.loads(wiki_get(WIKI_API + query))["query"]["pages"]
    for page in pages.values():
        info = page.get("imageinfo")
        if info:
            return info[0]["url"]
    return None


def fetch_trees():
    trees = []
    for group, names in TREE_GROUPS.items():
        for name in names:
            text = wiki_raw(f"{name} (skill tree)")
            match = re.search(r"\{\{ImageMap\|(\d+)px\|([^|]+)\|(.*?)\|caption=", text, re.S)
            if not match:
                print(f"  no image map on wiki for {name}, skipped")
                continue
            width, image, body = match.groups()
            icons = [
                {"name": icon_name.strip(), "x": int(x), "y": int(y), "size": int(size)}
                for icon_name, x, y, size in re.findall(r"\{\{TooltipImage\|([^|}]+)\|(\d+)\|(\d+)\|(\d+)\}\}", body)
            ]
            url = wiki_image_url(image.strip())
            if not url:
                print(f"  no image file for {name}, skipped")
                continue
            file_name = f"{normalize(name)}.png"
            TREES_DIR.mkdir(parents=True, exist_ok=True)
            (TREES_DIR / file_name).write_bytes(wiki_get(url))
            with Image.open(TREES_DIR / file_name) as picture:
                real_width, real_height = picture.size
            trees.append({"name": name, "group": group, "image": file_name, "width": real_width, "height": real_height, "icons": icons})
            print(f"  {name}: {len(icons)} icons, {real_width}x{real_height}")
    return trees


def build(data_path: Path):
    game = GameData(data_path)
    names = {key.lower(): name for key, name in english_names(game.strings).items()}
    sprites = game.sprites()
    sprite_index = {normalize(name): position for position, (name, *_rest) in enumerate(sprites)}

    skills = []
    for object_name, _sprite, _parent in game.objects():
        key = skill_key(object_name)
        if not key:
            continue
        kind = "passive" if object_name.startswith("o_pass_skill_") else "active"
        prefix = "s_passive_" if kind == "passive" else "s_skills_"
        icon_position = sprite_index.get(normalize(prefix + key))
        skills.append({
            "id": object_name,
            "key": key,
            "kind": kind,
            "name": NAME_OVERRIDES.get(key.lower()) or names.get(key.lower()) or key.replace("_", " ").title(),
            "iconIndex": icon_position,
        })

    write_icons(game, sprites, skills)

    print("fetching tree layouts from the wiki")
    trees = fetch_trees()
    # The wiki uses the game's current display names; the localization pool also holds older names,
    # so match against every English string recorded for a skill key.
    candidates = {}
    for key, options in english_name_candidates(game.strings).items():
        candidates.setdefault(key.lower(), []).extend(options)
    by_name = {}
    for skill in skills:
        for option in candidates.get(skill["key"].lower(), []) + [skill["name"]]:
            by_name.setdefault(normalize(option), skill["id"])
    unmatched = []
    for tree in trees:
        for icon in tree["icons"]:
            wiki_name = re.sub(r"\s*\(.*\)$", "", icon["name"])
            icon["skillId"] = by_name.get(normalize(wiki_name)) or by_name.get(normalize(WIKI_ALIASES.get(wiki_name, "")))
            if icon["skillId"]:
                # Prefer the wiki's name: it is what the game shows today.
                by_id = next(skill for skill in skills if skill["id"] == icon["skillId"])
                by_id["name"] = wiki_name
            else:
                unmatched.append(f"{tree['name']}: {icon['name']}")
    placed = {icon["skillId"] for tree in trees for icon in tree["icons"] if icon.get("skillId")}

    SKILLS_JSON.parent.mkdir(parents=True, exist_ok=True)
    SKILLS_JSON.write_text(json.dumps({"skills": sorted(skills, key=lambda s: s["name"].lower()), "trees": trees}, ensure_ascii=False, indent=0))
    print(f"skills: {len(skills)} ({sum(1 for s in skills if s.get('icon'))} with icons), placed on trees: {len(placed)} -> {SKILLS_JSON}")
    if unmatched:
        print("wiki icons without a matching skill:", unmatched)


def write_icons(game: GameData, sprites, skills):
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    pages = game.texture_pages()
    decoded = {}
    for skill in skills:
        position = skill.pop("iconIndex")
        if position is None:
            continue
        _name, _w, _h, frame = sprites[position]
        if frame is None:
            continue
        info = game.texture_page_entry(frame)
        if info["texture"] not in decoded:
            decoded[info["texture"]] = game.decode_texture(pages[info["texture"]])
        page = decoded[info["texture"]]
        image = Image.new("RGBA", (info["bound_w"], info["bound_h"]), (0, 0, 0, 0))
        image.paste(page.crop((info["source_x"], info["source_y"], info["source_x"] + info["source_w"], info["source_y"] + info["source_h"])), (info["target_x"], info["target_y"]))
        file_name = f"{re.sub(r'[^A-Za-z0-9_-]', '_', skill['key'])}.png"
        image.save(ICONS_DIR / file_name, optimize=True)
        skill["icon"] = file_name


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    build(Path(sys.argv[1]).expanduser())
