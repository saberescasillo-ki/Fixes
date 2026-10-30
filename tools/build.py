"""Rebuild the KID_SKY 'Player Action Optimization' pack for current Bedrock.

usage: python3 -I build.py <original_dir> <vanilla_resource_pack_dir> <out_dir>
"""
import copy
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lenient  # noqa: E402

orig, vanilla, out = sys.argv[1:4]


def load(path):
    text, _, _ = lenient.strip(open(path, encoding="utf-8-sig").read())
    return json.loads(text)


def dump(obj, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


anims = load(os.path.join(orig, "animations/animations.json"))
ctrls = load(os.path.join(orig, "animation_controllers/animation_controllers.json"))
v_entity = load(os.path.join(vanilla, "entity/player.entity.json"))
v_ctrls = load(os.path.join(vanilla, "animation_controllers/player.animation_controllers.json"))
v_root = v_ctrls["animation_controllers"]["controller.animation.player.root"]


# --- 1. Give every pack animation / controller its own identifier -------------
# The old pack overwrote vanilla ids that zombies, skeletons, drowned, piglins,
# etc. share with the player, so those mobs lost head tracking and got the
# player's custom poses. Unique ids + our own player.entity.json fix that.
def new_anim_id(old):
    if old.startswith("animation.kid_"):
        return old
    return "animation.kid_sky." + old[len("animation."):]


def new_ctrl_id(old):
    return "controller.animation.kid_sky." + old[len("controller.animation."):]


anim_map = {k: new_anim_id(k) for k in anims["animations"]}
ctrl_map = {k: new_ctrl_id(k) for k in ctrls["animation_controllers"]}

A = {anim_map[k]: v for k, v in anims["animations"].items()}
C = {ctrl_map[k]: v for k, v in ctrls["animation_controllers"].items()}

# Last keyframe sat at 0.5417 while the length was 0.54167.
A["animation.kid_sky.player.look_at_target.inverted"]["animation_length"] = 0.5417


# --- 2. Controllers ----------------------------------------------------------
def rewrite_strings(obj, fn):
    if isinstance(obj, dict):
        return {k: rewrite_strings(v, fn) for k, v in obj.items()}
    if isinstance(obj, list):
        return [rewrite_strings(v, fn) for v in obj]
    if isinstance(obj, str):
        return fn(obj)
    return obj


# 2a. look_at_target: only the player uses it now, so drop the dead "mobs"
#     branch (mobs keep the vanilla controller).
lat = C.pop("controller.animation.kid_sky.humanoid.look_at_target")
lat_states = lat["states"]
C["controller.animation.kid_sky.player.look_at_target"] = {
    "initial_state": "default",
    "states": {
        "default": {
            "blend_transition": 0.2,
            "transitions": [{"moving": lat_states["player"]["transitions"][0]["1"]}],
        },
        "moving": {
            "animations": lat_states["1"]["animations"],
            "blend_transition": 0.2,
            "transitions": [{"default": lat_states["1"]["transitions"][0]["player"]}],
        },
    },
}

# 2b. hudplayer: fix operator precedence. In the original, "a || b || c && d"
#     sent the player into the mid-air pose whenever they touched water, rode
#     or slept, for one frame, before bouncing back to default.
hud = C["controller.animation.kid_sky.player.hudplayer"]
shield_ok = ("((query.get_equipped_item_name('main_hand') != 'shield' || !query.is_sneaking) && "
             "(query.get_equipped_item_name('off_hand') != 'shield' || !query.is_sneaking))")
hud["initial_state"] = "default"
hud["states"]["1"]["transitions"] = [
    hud["states"]["1"]["transitions"][0],
    {"default": "query.is_in_water || query.is_riding || query.is_sleeping || query.is_gliding"},
    {"3": "!query.is_on_ground && query.all_animations_finished && query.is_on_screen && " + shield_ok},
]

# 2c. The attack controller hijacked controller.animation.persona.blink, which
#     broke blinking on Character Creator skins. It now has its own id and
#     yields to the new spear (its own attack anims) and crawling.
atk = C.pop("controller.animation.kid_sky.persona.blink")
atk["initial_state"] = "default"


def gate_attack(s):
    s = re.sub(r"!variable\.attack_time\b", "!(variable.attack_time && !variable.melee_spear_equipped)", s)
    s = re.sub(r"(?<![!(])variable\.attack_time\b", "(variable.attack_time && !variable.melee_spear_equipped)", s)
    return s.replace("!query.is_sleeping && !query.is_swimming",
                     "!query.is_sleeping && !query.is_swimming && !query.is_crawling")


atk = rewrite_strings(atk, gate_attack)
C["controller.animation.kid_sky.player.attack"] = atk

# 2d. Item-use controller: don't play the generic "use item" pose over the new
#     goat horn / brush / spear animations.
use_in = ("query.item_remaining_use_duration > 0.0 && (query.get_equipped_item_name != 'spyglass' && "
          "query.get_equipped_item_name != 'crossbow' && query.get_equipped_item_name != 'bow' && "
          "query.get_equipped_item_name != 'trident' && query.get_equipped_item_name != 'fishing_rod')")
use_out = ("(query.get_equipped_item_name == 'spyglass' || query.get_equipped_item_name == 'crossbow' || "
           "query.get_equipped_item_name == 'bow' || query.get_equipped_item_name == 'trident' || "
           "query.get_equipped_item_name == 'fishing_rod')")
new_items = "!variable.is_tooting_goat_horn && !variable.is_using_brush && !variable.melee_spear_equipped"


def gate_use(s):
    s = s.replace(use_in, use_in + " && " + new_items)
    return s.replace(use_out, use_out + " || !(" + new_items + ")")


cb = rewrite_strings(C["controller.animation.kid_sky.player.crossbow"], gate_use)
cb["initial_state"] = "default"
C["controller.animation.kid_sky.player.crossbow"] = cb
C["controller.animation.kid_sky.player.base"]["initial_state"] = "default"

# 2e. Root: the old one was a 1.16-era copy. Start from the current vanilla
#     root (first person, inventory paperdoll, map icon, spear, crawl, brush,
#     goat horn, heavy core...) and plug the pack's third-person logic in.
old_root = C.pop("controller.animation.kid_sky.player.root")
root = copy.deepcopy(v_root)
tp = old_root["states"]["2"]["animations"]
assert tp[0] == {"blink": "!variable.use_blinking_animation"}, tp[0]
root["states"]["paperdoll"]["animations"] = [
    "humanoid_base_pose", "vanilla_look_at_target_ui", "vanilla_move.arms", "vanilla_move.legs", "vanilla_cape",
]
root["states"]["third_person"]["animations"] = [
    # pack (KID_SKY)
    {"base_controller": "!query.is_crawling && !query.is_emoting"},
    {"hudplayer": "!query.is_sleeping && !query.is_crawling && !query.is_emoting"},
    {"look_at_target": "!query.is_sleeping && !query.is_crawling && !query.is_emoting"},
    {"crossbow_controller": "!query.is_sleeping && !query.is_emoting"},
    {"attack_controller": "!query.is_emoting"},
    {"holding_spyglass": "variable.is_holding_spyglass"},
    {"humanoid_base_pose": "!query.is_alive && !query.is_on_screen"},
    {"cape": "!query.is_alive && !query.is_on_screen"},
    # vanilla features newer than the pack
    {"riding.root": "query.is_riding"},
    {"charging": "query.is_charging"},
    {"vanilla_look_at_target_swimming": "query.is_crawling"},
    {"crawling": "query.is_crawling && !variable.melee_spear_equipped"},
    {"crawling.no_right_arm": "query.is_crawling && variable.melee_spear_equipped"},
    {"crawling.legs": "query.is_crawling"},
    {"tooting_goat_horn": "variable.is_tooting_goat_horn"},
    {"holding_brush": "query.get_equipped_item_name == 'brush'"},
    {"brushing": "variable.is_using_brush"},
    {"holding_heavy_core": "query.is_item_name_any('slot.weapon.mainhand', 'minecraft:heavy_core')"},
    {"third_person_melee_spear_controller": "variable.melee_spear_equipped"},
]
C["controller.animation.kid_sky.player.root"] = root

# --- 3. Player entity: latest vanilla, pointing at the pack's ids ------------
entity = copy.deepcopy(v_entity)
desc = entity["minecraft:client_entity"]["description"]
amap = desc["animations"]
vanilla_to_pack = {**{k: anim_map[k] for k in anim_map}, **ctrl_map}
for short, target in list(amap.items()):
    if target in vanilla_to_pack:
        amap[short] = vanilla_to_pack[target]
amap["root"] = "controller.animation.kid_sky.player.root"
amap["look_at_target"] = "controller.animation.kid_sky.player.look_at_target"
amap["attack_controller"] = "controller.animation.kid_sky.player.attack"
amap["vanilla_look_at_target_ui"] = "animation.player.look_at_target.ui"
amap["vanilla_look_at_target_swimming"] = "animation.humanoid.look_at_target.swimming"
amap["vanilla_move.arms"] = "animation.player.move.arms"
amap["vanilla_move.legs"] = "animation.player.move.legs"
amap["vanilla_cape"] = "animation.player.cape"
amap["blink"] = "controller.animation.persona.blink"

# --- 4. Write -----------------------------------------------------------------
manifest = load(os.path.join(orig, "manifest.json"))
version = [0, 5, 0]
manifest = {
    "format_version": 2,
    "header": {
        "description": manifest["header"]["description"],
        "name": manifest["header"]["name"].replace("Original 0.4", "Original 0.5"),
        "uuid": manifest["header"]["uuid"],
        "version": version,
        "min_engine_version": [1, 26, 0],
    },
    "modules": [{
        "description": manifest["modules"][0]["description"],
        "type": "resources",
        "uuid": manifest["modules"][0]["uuid"],
        "version": version,
    }],
    "metadata": {"authors": ["KID_SKY"]},
}

dump(manifest, os.path.join(out, "manifest.json"))
dump({"format_version": anims["format_version"], "animations": A},
     os.path.join(out, "animations/kid_sky.player.animation.json"))
dump({"format_version": ctrls["format_version"], "animation_controllers": C},
     os.path.join(out, "animation_controllers/kid_sky.player.animation_controllers.json"))
dump(entity, os.path.join(out, "entity/player.entity.json"))

from PIL import Image  # noqa: E402

Image.open(os.path.join(orig, "pack_icon.png")).convert("RGB").resize((256, 256), Image.LANCZOS).save(
    os.path.join(out, "pack_icon.png"), optimize=True)
print("built", out)
