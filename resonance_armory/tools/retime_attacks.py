#!/usr/bin/env python3
"""Acelera y suaviza las animaciones de ataque existentes de Resonance Armory.

- Divide los tiempos de cada keyframe por un factor por arma (ataques mas cortos
  => menos tiempo "congelado" al atacar).
- Convierte los keyframes intermedios lineales a catmullrom para que el
  movimiento no se vea tan rigido ("tieso").
- Fuerza `hold_on_last_frame` en los ataques del mandoble (estaban en loop).
- Reescribe el idle del Mandoble de Diamante: el attachable ya no rota los
  brazos (eso hacia que la espada saliera "pegada" al cuerpo y de lado); solo
  deja la espada alineada con la mano con un balanceo sutil.

Uso: python3 tools/retime_attacks.py  (desde resonance_armory/)
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANIM_DIR = os.path.join(ROOT, "RP", "animations")

# factor de velocidad por archivo (1.3 => 30% mas rapido)
SPEED = {
    "smoke_club.animation.json": 1.3,
    "iron_halberd.animation.json": 1.25,
    "golden_rapier.animation.json": 1.0,
    "copper_hammer.animation.json": 1.3,
    "diamond_greatsword.animation.json": 1.45,
    "netherite_relic_blade.animation.json": 1.3,
    "redstone_pulse_onearm_gauntlet.animation.json": 1.25,
    "lunar_crescent.animation.json": 1.2,
}

GREATSWORD_IDLE = {
    "loop": True,
    "bones": {
        # Solo el hueso propio del arma: nunca huesos del jugador.
        "greatsword": {
            "rotation": [
                "math.sin(query.life_time * 70) * 1.2",
                "math.cos(query.life_time * 55) * 1.0",
                0,
            ]
        }
    },
}


def is_attack(name: str) -> bool:
    return "attack" in name


def scale_time(t: str, f: float) -> str:
    v = round(float(t) / f, 4)
    s = ("%.4f" % v).rstrip("0").rstrip(".")
    if "." not in s:
        s += ".0"
    return s


def retime_channel(ch, f):
    """ch: lista estatica, o dict tiempo->valor."""
    if not isinstance(ch, dict):
        return ch
    items = sorted(ch.items(), key=lambda kv: float(kv[0]))
    out = {}
    n = len(items)
    for i, (t, v) in enumerate(items):
        nt = scale_time(t, f)
        # suavizado: keyframes intermedios lineales -> catmullrom
        if 0 < i < n - 1 and isinstance(v, list):
            v = {"post": v, "lerp_mode": "catmullrom"}
        out[nt] = v
    return out


def process_file(path, f):
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    changed = False
    for name, anim in data["animations"].items():
        if name == "animation.diamond_greatsword.idle":
            data["animations"][name] = GREATSWORD_IDLE
            changed = True
            continue
        if not is_attack(name):
            continue
        if "animation_length" in anim:
            anim["animation_length"] = round(anim["animation_length"] / f, 4)
        if anim.get("loop") is True:
            anim["loop"] = "hold_on_last_frame"
        for bone, chans in anim.get("bones", {}).items():
            for key in ("rotation", "position", "scale"):
                if key in chans:
                    chans[key] = retime_channel(chans[key], f)
        changed = True
    if changed:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
    return changed


def main():
    for fn, f in SPEED.items():
        p = os.path.join(ANIM_DIR, fn)
        if not os.path.exists(p):
            print("no existe", fn, file=sys.stderr)
            continue
        print(fn, "x%.2f" % f, "ok" if process_file(p, f) else "sin cambios")


if __name__ == "__main__":
    main()
