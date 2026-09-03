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

# The wiki keeps its per-skill tooltip text on one data page per tree.
SKILL_DATA_PAGES = [
    "Sword", "Axe", "Mace", "Dagger", "Two-handed Sword", "Two-handed Axe", "Two-handed Mace", "Spear", "Ranged",
    "Shield", "Staff", "Basic", "Athletic", "Warfare", "Magic Mastery", "Dual Wielding", "Survival",
    "Armored Combat", "Pyromancy", "Geomancy", "Electromancy", "Arcanistics",
]

# Wiki colour templates mapped to the tones the app renders.
TONES = {
    "w": "strong", "pos": "good", "positive": "good", "neg": "bad", "negative": "bad",
    "+": "good", "-": "bad", "fire": "fire", "shock": "shock", "arcane": "arcane", "energy": "energy",
    "unholy": "unholy", "caustic": "caustic", "poison": "caustic", "frost": "frost", "sacred": "sacred",
    "passive": "strong", "active": "strong", "light brown": "strong",
}

# Fields whose text carries wiki markup and is rendered as coloured runs, not plain strings.
MARKUP_FIELDS = ("requirements", "unlock")

# Fields worth showing in a tooltip, in display order.
INFO_FIELDS = [("Active", "type"), ("Type", "target"), ("Range", "range"), ("Energy", "energy"),
               ("Cooldown", "cooldown"), ("Armorpen", "armorPen"), ("Backfireper", "backfireChance"),
               ("Modifiers", "modifiers"), ("Requirements", "requirements"), ("Unlock", "unlock")]

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


def split_top_level(text, separator="|"):
    """Split on `separator`, ignoring separators nested inside {{ }}."""
    parts, depth, current, index = [], 0, "", 0
    while index < len(text):
        pair = text[index : index + 2]
        if pair == "{{":
            depth += 1
            current += pair
            index += 2
        elif pair == "}}":
            depth -= 1
            current += pair
            index += 2
        elif text[index] == separator and depth == 0:
            parts.append(current)
            current = ""
            index += 1
        else:
            current += text[index]
            index += 1
    parts.append(current)
    return parts


def unwrap_switch(text, parameter):
    """Strip a `{{#switch: {{{n}}} ... }}` wrapper so its cases sit at brace depth 0."""
    text = re.sub(r"^\{\{#switch:\s*\{\{\{" + str(parameter) + r"\}\}\}", "", text.strip()).rstrip()
    return text[:-2] if text.endswith("}}") else text


def parse_skill_data_page(text):
    """One wiki data page holds a switch of skill names, each a switch of fields."""
    body = text.split("<includeonly>", 1)[-1].rsplit("</includeonly>", 1)[0]
    body = re.sub(r"<!--.*?-->", "", body, flags=re.S)
    skills = {}
    for case in split_top_level(unwrap_switch(body, 1))[1:]:
        if "=" not in case:
            continue
        name, rest = case.split("=", 1)
        name = name.strip()
        if not name or name.startswith("#"):
            continue
        fields = {}
        for field in split_top_level(unwrap_switch(rest, 2))[1:]:
            if "=" not in field:
                continue
            key, value = field.split("=", 1)
            fields[key.strip()] = value.strip()
        if fields:
            skills[name] = fields
    return skills


def render_markup(text):
    """Turn a wiki description into paragraphs of {text, tone} runs."""
    paragraphs = []
    for chunk in re.split(r"(?:<br\s*/?>\s*)+", text):
        runs = []
        emit(chunk, None, runs)
        runs = [run for run in runs if run["text"]]
        if runs:
            paragraphs.append(runs)
    return paragraphs


def emit(text, tone, runs):
    """Walk one chunk, turning {{tone|...}} templates into runs and keeping everything else plain."""
    index = 0
    while index < len(text):
        start = text.find("{{", index)
        if start < 0:
            break
        add_run(text[index:start], tone, runs)
        depth, cursor = 0, start
        while cursor < len(text):
            if text[cursor : cursor + 2] == "{{":
                depth += 1
                cursor += 2
            elif text[cursor : cursor + 2] == "}}":
                depth -= 1
                cursor += 2
                if depth == 0:
                    break
            else:
                cursor += 1
        arguments = split_top_level(text[start + 2 : cursor - 2])
        name = arguments[0].strip().lower()
        inner_tone = TONES.get(name)
        body = arguments[-1] if len(arguments) > 1 else ""
        if name in ("c", "color", "colour") and len(arguments) > 2:
            inner_tone = TONES.get(arguments[1].strip().lower())
        emit(body, inner_tone or tone, runs)
        index = cursor
    add_run(text[index:], tone, runs)


def add_run(text, tone, runs):
    text = re.sub(r"<[^>]+>", "", text).replace("&nbsp;", " ")
    if not text:
        return
    if runs and runs[-1].get("tone") == tone:
        runs[-1]["text"] += text
    else:
        runs.append({"text": text, "tone": tone} if tone else {"text": text})


def fetch_skill_info():
    """Per-skill tooltip data from the wiki, keyed by display name."""
    info = {}
    for page in SKILL_DATA_PAGES:
        try:
            parsed = parse_skill_data_page(wiki_raw(f"{page} skill data"))
        except Exception as error:
            print(f"  {page} skill data: {error}")
            continue
        for name, fields in parsed.items():
            if name in info:
                continue
            entry = {key: fields[column] for column, key in INFO_FIELDS if fields.get(column)}
            if fields.get("Description"):
                entry["description"] = render_markup(fields["Description"])
            for key in MARKUP_FIELDS:
                if key not in entry:
                    continue
                # Requirements read as "- Requires a spear"; drop the bullet and keep the sentence.
                paragraphs = render_markup(re.sub(r"^[-–·]\s*", "", entry[key]))
                entry[key] = paragraphs[0] if paragraphs else None
                if entry[key] is None:
                    del entry[key]
            info[name] = entry
        print(f"  {page + ' skill data':<28} {len(parsed):>3} skills")
    return info


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
    for object_name, sprite, _parent in game.objects():
        key = skill_key(object_name)
        if not key:
            continue
        kind = "passive" if object_name.startswith("o_pass_skill_") else "active"
        # The skill object points at its own icon. Sprite names do not follow the key reliably
        # (Butchering uses s_skills_skinning, and several carry typos), so trust the object.
        prefix = "s_passive_" if kind == "passive" else "s_skills_"
        icon_position = sprite if 0 <= sprite < len(sprites) else sprite_index.get(normalize(prefix + key))
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
    print("fetching skill tooltips from the wiki")
    skill_info = fetch_skill_info()
    # The wiki disambiguates some names ("Bonebreaker (Two-Handed Mace skill)"); the game does not.
    normalized_info = {}
    for name, entry in skill_info.items():
        normalized_info.setdefault(normalize(re.sub(r"\s*\(.*\)$", "", name)), entry)
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

    described = 0
    for skill in skills:
        entry = normalized_info.get(normalize(skill["name"]))
        if entry:
            skill["info"] = entry
            described += 1

    SKILLS_JSON.parent.mkdir(parents=True, exist_ok=True)
    SKILLS_JSON.write_text(json.dumps({"skills": sorted(skills, key=lambda s: s["name"].lower()), "trees": trees}, ensure_ascii=False, indent=0))
    print(f"skills: {len(skills)} ({sum(1 for s in skills if s.get('icon'))} with icons, {described} with tooltips), placed on trees: {len(placed)} -> {SKILLS_JSON}")
    undescribed = [skill["name"] for skill in skills if skill["id"] in placed and not skill.get("info")]
    if undescribed:
        print("tree skills with no wiki tooltip:", undescribed)
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
