#!/usr/bin/env python3
"""Genera las animaciones de ataque en PRIMERA persona de todas las armas.

Las animaciones de combo estan hechas para tercera persona (mueven cintura,
piernas, brazo con giros de mas de 180 grados...). Aplicadas al brazo de
primera persona quedan fuera de camara o deformadas. Aqui se genera, por cada
ataque que usa el script, una animacion `animation.<arma>.fp_<ataque>` que solo
mueve `rightArm` con amplitudes pensadas para la camara en primera persona
(anticipacion -> golpe -> inercia -> vuelta), sincronizada con el frame de
golpe real del script.

El script reproduce la de tercera persona con stopExpression
`variable.is_first_person` y esta con `!variable.is_first_person`, asi cada
vista solo ve la suya.

Uso: python3 tools/gen_first_person.py   (desde resonance_armory/, despues de
ajustar los tiempos en BP/scripts/main.js)
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_new_weapons import bake, TICK, Z  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN_JS = os.path.join(ROOT, "BP", "scripts", "main.js")
OUT = os.path.join(ROOT, "RP", "animations", "resonance_first_person.animation.json")

# (rot, pos) de rightArm en: anticipacion, impacto, inercia
STYLES = {
    "slash": (([12, -28, -12], [4, 2, 2]), ([-62, 42, 20], [-8, -3, -2]), ([-48, 52, 24], [-10, -5, -1])),
    "back": (([-18, 42, 16], [-7, 1, 0]), ([-44, -26, -22], [4, -3, -2]), ([-36, -38, -28], [6, -5, -1])),
    "chop": (([38, -4, 0], [0, 6, 3]), ([-78, 14, 6], [-2, -7, -3]), ([-68, 16, 6], [-2, -9, -2])),
    "thrust": (([12, -6, 0], [1, -1, 6]), ([-22, 14, 0], [-3, 2, -10]), ([-16, 10, 0], [-2, 1, -7])),
    "rise": (([-50, 10, 10], [0, -6, 0]), ([30, -10, -6], [1, 6, -3]), ([38, -12, -6], [1, 8, -2])),
}

# estilo por arma segun el indice del ataque en el combo (attack, attack1, attack2)
WEAPON_STYLES = {
    "smoke_club": ["slash", "back", "chop"],
    "iron_halberd": ["thrust", "slash", "chop"],
    "golden_rapier": ["thrust", "thrust", "slash"],
    "copper_hammer": ["chop", "slash", "chop"],
    "diamond_greatsword": ["chop", "slash", "back"],
    "netherite_relic_blade": ["slash", "back", "chop"],
    "redstone_pulse_gauntlet": ["thrust", "thrust", "thrust", "thrust"],
    "lunar_crescent": ["slash"],
    "amethyst_glaive": ["thrust", "slash", "chop"],
    "blaze_scimitar": ["slash", "back", "rise"],
    "echo_maul": ["chop", "slash", "chop"],
}
AMPLITUDE = {"golden_rapier": 0.8, "blaze_scimitar": 0.9, "redstone_pulse_gauntlet": 0.85}


def parse_attacks():
    src = open(MAIN_JS, encoding="utf-8").read()
    out = {}
    for m in re.finditer(r'animation: "(animation\.([a-z_]+)\.([A-Za-z0-9_]+))",(.*?)\n  \}', src, re.S):
        full, weapon, name, body = m.groups()
        at = int(re.search(r"attackTime: (\d+)", body).group(1))
        hit = int(re.search(r"hitFrames: \[(\d+)", body).group(1))
        out[full] = (weapon, name, at, hit)
    return out


def scale(v, k):
    return [round(x * k, 2) for x in v]


def fp_anim(weapon, name, attack_time, hit):
    digits = re.search(r"(\d+)$", name)
    idx = int(digits.group(1)) if digits else 0
    styles = WEAPON_STYLES[weapon]
    (wr, wp), (sr, sp), (fr, fp) = STYLES[styles[idx % len(styles)]]
    k = AMPLITUDE.get(weapon, 1.0)
    end = max(hit + 4, min(attack_time, hit + 10))
    fol = min(end - 1, hit + 2)
    rot, pos = [(0, Z)], [(0, Z)]
    if hit >= 3:
        win = max(1, min(hit - 2, round(hit * 0.6)))
        rot.append((win, scale(wr, k), "io"))
        pos.append((win, scale(wp, k), "io"))
    rot += [(hit, scale(sr, k), "in"), (fol, scale(fr, k), "out"), (end, Z, "io")]
    pos += [(hit, scale(sp, k), "in"), (fol, scale(fp, k), "out"), (end, Z, "io")]
    return {
        "loop": "hold_on_last_frame",
        "animation_length": round(max(end, attack_time) * TICK, 2),
        "bones": {"rightArm": {"rotation": bake(rot, end), "position": bake(pos, end)}},
    }


def main():
    anims = {}
    for full, (weapon, name, at, hit) in sorted(parse_attacks().items()):
        if weapon not in WEAPON_STYLES:
            print("sin estilo:", weapon, file=sys.stderr)
            continue
        anims["animation.%s.fp_%s" % (weapon, name)] = fp_anim(weapon, name, at, hit)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"format_version": "1.8.0", "animations": anims}, fh, indent=1)
        fh.write("\n")
    print("primera persona:", len(anims), "animaciones")


if __name__ == "__main__":
    main()
