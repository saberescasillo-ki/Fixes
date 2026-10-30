"""Cross-check a built pack against the vanilla resource pack.

usage: python3 -I check.py <pack_dir> <vanilla_resource_pack_dir>
"""
import glob
import json
import os
import re
import sys

pack, vanilla = sys.argv[1:3]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lenient  # noqa: E402

errors = []


def strict(path):
    def hook(pairs):
        keys = [k for k, _ in pairs]
        for k in set(keys):
            if keys.count(k) > 1:
                errors.append(f"{path}: duplicate key {k}")
        return dict(pairs)
    return json.load(open(path, encoding="utf-8"), object_pairs_hook=hook)


def lenient_load(path):
    return json.loads(lenient.strip(open(path, encoding="utf-8-sig").read())[0])


pack_anims, pack_ctrls = {}, {}
for f in glob.glob(os.path.join(pack, "**/*.json"), recursive=True):
    d = strict(f)  # must be strict JSON (no comments / trailing commas)
    pack_anims.update(d.get("animations", {}))
    pack_ctrls.update(d.get("animation_controllers", {}))

van_ids = set()
for f in glob.glob(os.path.join(vanilla, "animations/*.json")) + glob.glob(os.path.join(vanilla, "animation_controllers/*.json")):
    d = lenient_load(f)
    van_ids |= set(d.get("animations", {})) | set(d.get("animation_controllers", {}))
van_ctrls = {}
for f in glob.glob(os.path.join(vanilla, "animation_controllers/*.json")):
    van_ctrls.update(lenient_load(f)["animation_controllers"])

overlap = (set(pack_anims) | set(pack_ctrls)) & van_ids
if overlap:
    errors.append(f"pack overrides vanilla ids: {sorted(overlap)}")

entity = strict(os.path.join(pack, "entity/player.entity.json"))
amap = entity["minecraft:client_entity"]["description"]["animations"]
van_amap = lenient_load(os.path.join(vanilla, "entity/player.entity.json"))["minecraft:client_entity"]["description"]["animations"]
for short, target in amap.items():
    if target not in pack_anims and target not in pack_ctrls and target not in van_ids:
        if van_amap.get(short) == target:
            print(f"note: {short} -> {target} is dangling in vanilla too (unused)")
        else:
            errors.append(f"entity: {short} -> {target} does not exist")

all_ctrls = {**van_ctrls, **pack_ctrls}


def used_names(ctrl):
    for state in ctrl["states"].values():
        for a in state.get("animations", []):
            yield from (a.keys() if isinstance(a, dict) else [a])


reachable = set(amap.values())
for cid in [c for c in all_ctrls if c in reachable]:
    ctrl = all_ctrls[cid]
    states = ctrl["states"]
    init = ctrl.get("initial_state", "default")
    if init not in states:
        errors.append(f"{cid}: initial state {init} missing")
    for sname, state in states.items():
        for t in state.get("transitions", []):
            for dest, cond in t.items():
                if dest not in states:
                    errors.append(f"{cid}.{sname}: transition to missing state {dest}")
    for n in used_names(ctrl):
        if n not in amap:
            errors.append(f"{cid}: uses short name '{n}' not in player entity")

molang = []


def walk(o):
    if isinstance(o, dict):
        for v in o.values():
            walk(v)
    elif isinstance(o, list):
        for v in o:
            walk(v)
    elif isinstance(o, str):
        molang.append(o)


walk(pack_anims)
walk(pack_ctrls)
for s in molang:
    depth = 0
    for ch in s:
        depth += ch == "("
        depth -= ch == ")"
        if depth < 0:
            break
    if depth != 0:
        errors.append(f"unbalanced parens: {s}")
    if re.search(r"'map'", s):
        errors.append(f"old item name 'map' (now 'filled_map'): {s}")

unused = set(pack_anims) - set(amap.values())
print("pack animations:", len(pack_anims), "controllers:", len(pack_ctrls))
print("defined but not mapped in entity:", sorted(unused))
print("\n".join(errors) or "OK: no errors")
sys.exit(1 if errors else 0)
