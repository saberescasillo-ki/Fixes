#!/usr/bin/env python3
"""Ajusta `cancelIntoNextTick` de cada ataque para que el combo encadene limpio.

playAnimation no tiene mezcla de entrada: al encadenar, la animacion siguiente
arranca de golpe en su primer frame. Si se corta la actual en un tick donde la
pose no se parece a ese primer frame, se ve un salto ("se ejecuta de nuevo a la
mitad"). Este script evalua la pose de cada ataque tick a tick y elige, despues
del golpe, el tick cuya pose mas se parece al inicio del siguiente ataque del
combo. Reescribe los valores en BP/scripts/main.js.

Uso: python3 tools/tune_chain.py   (desde resonance_armory/)
"""
import glob
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN_JS = os.path.join(ROOT, "BP", "scripts", "main.js")
BONES = ["root", "waist", "body", "head", "rightArm", "leftArm", "rightItem", "leftLeg", "rightLeg"]
MIN_AFTER_HIT = 4  # ticks de inercia que siempre se ven tras el golpe


def load_anims():
    out = {}
    for f in glob.glob(os.path.join(ROOT, "RP", "animations", "*.json")):
        out.update(json.load(open(f, encoding="utf-8"))["animations"])
    return out


def num(v, arriving):
    if isinstance(v, dict):
        v = v.get("pre", v.get("post")) if arriving else v.get("post", v.get("pre"))
    return [x if isinstance(x, (int, float)) else 0.0 for x in v]


def sample(ch, t):
    if ch is None:
        return [0.0, 0.0, 0.0]
    if not isinstance(ch, dict):
        return num(ch, False)
    keys = sorted(ch.items(), key=lambda kv: float(kv[0]))
    if t <= float(keys[0][0]):
        return num(keys[0][1], False)
    for (ta, va), (tb, vb) in zip(keys, keys[1:]):
        ta, tb = float(ta), float(tb)
        if ta <= t <= tb:
            u = (t - ta) / max(1e-6, tb - ta)
            a, b = num(va, False), num(vb, True)
            return [a[i] + (b[i] - a[i]) * u for i in range(3)]
    return num(keys[-1][1], False)


def pose(anim, t):
    p = []
    for b in BONES:
        ch = anim.get("bones", {}).get(b, {})
        p += sample(ch.get("rotation"), t)
        p += [x * 4 for x in sample(ch.get("position"), t)]  # 1 px ~ 4 grados
    return p


def dist(a, b):
    return sum(abs(x - y) for x, y in zip(a, b))


def main():
    anims = load_anims()
    src = open(MAIN_JS, encoding="utf-8").read()
    changes = 0
    pending = []
    # cada array de ataques: `var X = [ {...}, {...} ];`
    for arr in re.finditer(r"var \w+ = \[\n((?:  \{.*?\n  \},?\n)+)\];", src, re.S):
        entries = list(re.finditer(r'  \{\n\s*animation: "([^"]+)",(.*?)\n  \}', arr.group(1), re.S))
        if not entries:
            continue
        infos = []
        for e in entries:
            body = e.group(2)
            infos.append({
                "name": e.group(1),
                "at": int(re.search(r"attackTime: (\d+)", body).group(1)),
                "hits": [int(x) for x in re.search(r"hitFrames: \[([^\]]+)\]", body).group(1).split(",")],
                "cancel": int(re.search(r"cancelIntoNextTick: (\d+)", body).group(1)),
                "span": (arr.start(1) + e.start(), arr.start(1) + e.end()),
            })
        for i, info in enumerate(infos):
            cur, nxt = anims.get(info["name"]), anims.get(infos[(i + 1) % len(infos)]["name"])
            if not cur or not nxt:
                continue
            target = pose(nxt, 0.0)
            lo = min(info["at"], info["hits"][-1] + MIN_AFTER_HIT)
            best = min(range(lo, info["at"] + 1), key=lambda t: (dist(pose(cur, t * 0.05), target), t))
            info["new"] = best
        pending += [i for i in infos if "new" in i and i["new"] != i["cancel"]]
    for info in sorted(pending, key=lambda x: -x["span"][0]):
        a, b = info["span"]
        block = re.sub(r"cancelIntoNextTick: \d+", "cancelIntoNextTick: %d" % info["new"], src[a:b])
        block = re.sub(r"nextAttackWindow: (\d+)",
                       lambda m: "nextAttackWindow: %d" % min(int(m.group(1)), info["new"]), block)
        src = src[:a] + block + src[b:]
        changes += 1
        print("%-52s golpe %-8s fin %2d  cancel %2d -> %2d" % (
            info["name"], info["hits"], info["at"], info["cancel"], info["new"]))
    open(MAIN_JS, "w", encoding="utf-8").write(src)
    print("cambios:", changes)


if __name__ == "__main__":
    main()
