"""Rebuild 'FAnimation Update 7' (fieryabyss) for current Bedrock + marketplace skins.

usage: python3 -I build_fanim.py <original_dir> <vanilla_resource_pack_dir> <out_dir>
"""
import copy
import json
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lenient  # noqa: E402

orig, vanilla, out = sys.argv[1:4]


def load(path):
    return json.loads(lenient.strip(open(path, encoding="utf-8-sig").read())[0])


def dump(obj, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


def read(rel):
    return open(os.path.join(out, rel), encoding="utf-8-sig").read()


def write(rel, text):
    with open(os.path.join(out, rel), "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def must_sub(pattern, repl, text, count=1):
    new, n = re.subn(pattern, repl, text)
    assert n == count, (pattern, n)
    return new


# --- 0. Start from a copy, minus files the game never reads ------------------
if os.path.exists(out):
    shutil.rmtree(out)
shutil.copytree(orig, out, ignore=shutil.ignore_patterns("subpacks"))
for junk in ["back_sword.json",            # render controller outside render_controllers/, never loaded
             ".mcattributes",              # editor config, not a game file
             "sounds/fiery/heartbeat.MP3",  # MP3 is not a supported format (the .ogg is used)
             "sounds/fiery/sword_stabswadwda.ogg"]:  # unreferenced duplicate
    os.remove(os.path.join(out, junk))

v_entity = load(os.path.join(vanilla, "entity/player.entity.json"))["minecraft:client_entity"]["description"]
v_ctrls = load(os.path.join(vanilla, "animation_controllers/player.animation_controllers.json"))["animation_controllers"]
v_rcs = load(os.path.join(vanilla, "render_controllers/player.render_controllers.json"))["render_controllers"]

# --- 1. Stop overriding vanilla ids that mobs share ----------------------------
# The pack replaced controller.animation.humanoid.brandish_spear with a version
# that reads variable.trident (only defined on the player), which broke trident /
# spear poses on drowned, skeletons, strays, bogged, vex, piglins...
hm = read("animation_controllers/hm.animation_controllers.json")
hm = must_sub(r'"controller\.animation\.humanoid\.brandish_spear"', '"controller.animation.fanim.brandish_spear"', hm)
hm = must_sub(r'"controller\.animation\.player\.crossbow"', '"controller.animation.fanim.crossbow"', hm)
write("animation_controllers/hm.animation_controllers.json", hm)

# --- 2. Root controller ------------------------------------------------------
# first_person_attack / first_person_map were byte-for-byte vanilla copies:
# drop them so future vanilla fixes apply. Root gets its own id and the 1.26
# first-person state (spear, shield, breathing bob order).
pc = load(os.path.join(orig, "animation_controllers/player.animation_controllers.json"))["animation_controllers"]
for k in ["controller.animation.player.first_person_attack", "controller.animation.player.first_person_map"]:
    assert pc[k] == v_ctrls[k], k
root = pc["controller.animation.player.root"]
root["states"]["first_person"] = copy.deepcopy(v_ctrls["controller.animation.player.root"]["states"]["first_person"])
tp = root["states"]["third_person"]["animations"]
tp.insert(tp.index({"riding.arms": "query.is_riding"}), {"riding.root": "query.is_riding"})
tp.append({"holding_heavy_core": "query.is_item_name_any('slot.weapon.mainhand', 'minecraft:heavy_core')"})
dump({"format_version": "1.10.0", "animation_controllers": {"controller.animation.fanim.player.root": root}},
     os.path.join(out, "animation_controllers/player.animation_controllers.json"))

# --- 3. Attack controllers: unreachable "3" transitions (state does not exist) --
fca_path = os.path.join(out, "animation_controllers/fc.attack.animation_controllers.json")
fca = load(fca_path)
for k in ["controller.animation.attack.dagger", "controller.animation.attack.halbert2"]:
    st = fca["animation_controllers"][k]["states"]
    assert "3" not in st
    st["default"]["transitions"] = [t for t in st["default"]["transitions"] if "3" not in t]
dump(fca, fca_path)

# --- 4. Missing / broken animations -----------------------------------------
dump({"format_version": "1.8.0", "animations": {
    # 0.25 s timer the spear combo waits on (was referenced but never defined)
    "animation.player.time_25": {"animation_length": 0.25, "bones": {"root": {"position": [0, 0, 0]}}},
}}, os.path.join(out, "animations/fanim_fixes.animation.json"))

pa = read("animations/player.animation.json")
# Looping animation with no length => the heartbeat sound fired every frame.
pa = must_sub(r'("animation\.heartbeat"\s*:\s*\{)', r'\1 "animation_length": 0.9,', pa)
write("animations/player.animation.json", pa)

# --- 5. Render controllers: the player body (marketplace skins) ---------------
prc_path = os.path.join(out, "render_controllers/player.render_controllers.json")
prc = load(prc_path)
for k, rc in prc["render_controllers"].items():
    new = copy.deepcopy(v_rcs[k])
    # keep the pack's choice of no red hurt / fire tint (it has its own hurt anim)
    for tint in ("is_hurt_color", "on_fire_color"):
        if tint in rc:
            new[tint] = rc[tint]
    prc["render_controllers"][k] = new
dump(prc, prc_path)

# --- 6. Back items + cape: one definition per option, in every subpack --------
sp_default = os.path.join(orig, "subpacks/default/render_controllers")
back_rcs, cape_rcs = {}, {}
for f in sorted(os.listdir(sp_default)):
    target = cape_rcs if f.startswith("cape") else back_rcs
    target.update(load(os.path.join(sp_default, f))["render_controllers"])
assert set(cape_rcs) == {"controller.render.cape"}, cape_rcs.keys()


def stub(rc):
    return {"geometry": rc["geometry"], "materials": [{"*": "Material.default"}],
            "textures": ["Texture.empty"], "part_visibility": [{"*": False}]}


subpacks = [  # Bedrock pre-selects the LAST entry
    ("cape_off_back_off", "§cSin capa custom ni accesorios", False, False),
    ("back_off", "§6Sin accesorios en la espalda", True, False),
    ("cape_off", "§bCapa de tu skin / Marketplace", False, True),
    ("default", "§l§aDefault", True, True),
]
for folder, _, cape_on, back_on in subpacks:
    base = os.path.join(out, "subpacks", folder, "render_controllers")
    dump({"format_version": "1.8.0", "render_controllers":
          cape_rcs if cape_on else {k: stub(v) for k, v in cape_rcs.items()}},
         os.path.join(base, "fanim_cape.render_controllers.json"))
    dump({"format_version": "1.8.0", "render_controllers":
          back_rcs if back_on else {k: stub(v) for k, v in back_rcs.items()}},
         os.path.join(base, "fanim_back_items.render_controllers.json"))

# --- 7. Player entity --------------------------------------------------------
ent_path = os.path.join(out, "entity/player.entity.json")
ent = load(ent_path)
d = ent["minecraft:client_entity"]["description"]

# 7a. materials/textures the engine needs for skins and capes
d["materials"] = {**v_entity["materials"], **{k: v for k, v in d["materials"].items() if k not in v_entity["materials"]}}
d["textures"]["cape"] = v_entity["textures"]["cape"]
del d["textures"]["herobrine_sword"]  # file does not exist, nothing uses it

# 7b. scripts
sc = d["scripts"]
HOTBAR9 = lambda item: "(" + " || ".join(f"q.is_item_name_any('slot.hotbar', {i}, '{item}')" for i in range(9)) + ")"
pre = []
for line in sc["pre_animation"]:
    if line.startswith("variable.helmet_layer_visible"):
        line = v_entity["scripts"]["pre_animation"][0]  # hide skin hat layer under a helmet, like vanilla
    if line.startswith("variable.shield ="):
        # used temp.i outside of any loop ("unknown variable 'temp.i'")
        line = f"variable.shield = {HOTBAR9('minecraft:shield')};"
    pre.append(line)
assert any(l.startswith("variable.shield = (q.is_item_name_any") for l in pre)
pre.append(v_entity["scripts"]["pre_animation"][-1])  # variable.riding_y_offset (riding.root)
pre.append("variable.melee_spear_equipped = query.equipped_item_any_tag('slot.weapon.mainhand', 'minecraft:is_spear');")
sc["pre_animation"] = pre
sc["variables"] = v_entity["scripts"]["variables"]
sc["should_update_effects_offscreen"] = v_entity["scripts"]["should_update_effects_offscreen"]

animate = []
for a in sc["animate"]:
    name = next(iter(a)) if isinstance(a, dict) else a
    if name in ("armor_cape", "p.dagger_pose", "p.fly", "p.fall_bs"):
        continue  # animations/controllers that were never shipped (see README)
    if name == "hide_item_left":
        if any(isinstance(x, dict) and "hide_item_left" in x for x in animate):
            continue
        a = {"hide_item_left": "(!v.is_first_person && v.hide_item_left && v.hide_item) || "
                               "q.is_item_name_any('slot.weapon.offhand', 0, 'minecraft:filled_map') || "
                               "(query.get_equipped_item_name == 'crossbow' && (query.item_remaining_use_duration > 0.0 || q.item_is_charged)) || v.using_bow"}
    if name == "heartbeat":
        if any(isinstance(x, dict) and "heartbeat" in x for x in animate):
            continue  # second, unconditional copy: heartbeat played all the time
        a = {"heartbeat": "query.is_alive && query.health <= 2"}
    animate.append(a)
sc["animate"] = animate

# 7c. animation map: vanilla 1.26 names first, the pack's on top, then fixes
amap = {**v_entity["animations"], **d["animations"]}
for gone in ["armor_cape", "hurt2", "p.climb", "climb", "p.fly", "p.fall_bs", "fall_bs", "ground_bs",
             "base_controller", "hudplayer"]:
    del amap[gone]
amap["halbert.attack3"] = "animation.player.halbert_attack3"  # was 'chalbert_attack3'
amap["root"] = "controller.animation.fanim.player.root"
amap["p.brandish_spear"] = "controller.animation.fanim.brandish_spear"
amap["crossbow_controller"] = "controller.animation.fanim.crossbow"
d["animations"] = amap
del d["particle_effects"]["blood"]  # fiery:blood is not in this pack and nothing plays it

# 7d. render controllers
cape_cond = ("!v.is_first_person && q.is_alive && !q.is_spectator && !q.is_invisible && !v.shield && "
             "!q.is_item_name_any('slot.armor.chest', 0, 'minecraft:elytra') && "
             "!q.is_item_name_any('slot.armor.chest', 0, 'fiery:darksteel_chestplate') && "
             # the skin (marketplace / persona / Minecoin) brings its own cape: show that one
             "!query.has_cape")
back = re.compile(r"t\.val = 0; t\.i = 0; loop\(27, \{ t\.val = q\.is_item_name_any\('slot\.hotbar', t\.i, '([^']+)'\)"
                  r"(?P<extra>(?: && !q\.is_item_name_any\('slot\.armor\.chest', 0, '[^']+'\))?)"
                  r" && !q\.is_item_name_any\('slot\.weapon\.mainhand', t\.i, '\1'\)"
                  r"(?: && !q\.is_item_name_any\('slot\.hotbar', t\.i, '[^']+'\))?"
                  r" && !variable\.is_first_person; t\.val \? \{return t\.val;\}; t\.i = t\.i\+1; \}\);$")
sheath = re.compile(r"t\.val = 0; t\.i = 0; loop\(27, \{ t\.val = q\.is_item_name_any\('slot\.weapon\.mainhand', t\.i, '([^']+)'\)"
                    r" && (!?)q\.is_item_name_any\('slot\.weapon\.offhand', t\.i, ''\)"
                    r" && !variable\.is_first_person; t\.val \? \{return t\.val;\}; t\.i = t\.i\+1; \}\);$")
rcs = {}
for entry in d["render_controllers"]:
    (name, cond), = entry.items()
    m = back.match(cond)
    s = sheath.match(cond)
    if m:
        # 'slot.weapon.mainhand' only has index 0; with t.i > 0 the old check was always
        # false, so the item you were holding was ALSO drawn on your back.
        item = m.group(1)
        extra = m.group("extra").replace(" && ", "", 1)
        cond = " && ".join(x for x in ["!variable.is_first_person", extra,
                                        f"!q.is_item_name_any('slot.weapon.mainhand', 0, '{item}')",
                                        HOTBAR9(item)] if x)
    elif s:
        cond = (f"!variable.is_first_person && q.is_item_name_any('slot.weapon.mainhand', 0, '{s.group(1)}') && "
                f"{s.group(2)}q.is_item_name_any('slot.weapon.offhand', 0, '')")
    elif name == "controller.render.cape":
        cond = cape_cond
    else:
        assert "t.i" not in cond, name
    if name in rcs:  # hero_sword / void_breaker were listed twice (main item + _copy)
        rcs[name] = f"({rcs[name]}) || ({cond})"
    else:
        rcs[name] = cond
assert not any("t.i" in c for c in rcs.values())
d["render_controllers"] = [{k: v} for k, v in rcs.items()]
ent["format_version"] = "1.26.0"
dump(ent, ent_path)

# --- 8. Manifest -------------------------------------------------------------
man = load(os.path.join(orig, "manifest.json"))
version = [0, 1, 0]
man["header"]["name"] = "§l§bFAnimation §r|§l §6Update 7 §r§a(fix)"
man["header"]["version"] = version
man["header"]["min_engine_version"] = [1, 26, 0]
man["modules"][0]["version"] = version
man["subpacks"] = [{"folder_name": f, "name": n, "memory_tier": 1} for f, n, _, _ in subpacks]
man["metadata"] = {"authors": ["fieryabyss"]}
dump(man, os.path.join(out, "manifest.json"))
print("built", out)
