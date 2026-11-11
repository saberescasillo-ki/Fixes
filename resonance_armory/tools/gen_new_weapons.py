#!/usr/bin/env python3
"""Genera las 3 armas nuevas de Resonance Armory (RP + BP, salvo el script):

  resonance:amethyst_glaive   Glaive Resonante de Amatista  (resonancia / campanada)
  resonance:blaze_scimitar    Cimitarra de Brasas           (fuego / brasas)
  resonance:echo_maul         Mazo Sonico de Eco            (pulso sonico)

Produce, siguiendo el mismo esquema que las armas existentes:
  RP/textures/items/<id>.png (icono 32x32), RP/textures/models/<id>.png (128x128),
  RP/models/entity/<id>.geo.json, RP/attachables/<id>.json,
  RP/animations/<id>.animation.json (idle + attack/attack1/attack2),
  BP/items/<id>.json, entradas en item_texture.json, texts/*.lang y en la
  lista de exclusion de player.animation_controllers.json.

Uso: python3 tools/gen_new_weapons.py   (desde resonance_armory/)
"""
import json
import math
import os
import random

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "RP")
BP = os.path.join(ROOT, "BP")

random.seed(7)

# ---------------------------------------------------------------------------
# Definicion de armas
# ---------------------------------------------------------------------------
WEAPONS = [
    {
        "id": "amethyst_glaive",
        "bone": "glaive",
        "names": {
            "en_US": "Amethyst Resonator Glaive",
            "es_ES": "Glaive Resonante de Amatista",
            "es_MX": "Glaive Resonante de Amatista",
        },
        "durability": 1800,
        "repair": "minecraft:amethyst_shard",
        "enchant_value": 12,
    },
    {
        "id": "blaze_scimitar",
        "bone": "scimitar",
        "names": {
            "en_US": "Blaze Ember Scimitar",
            "es_ES": "Cimitarra de Brasas",
            "es_MX": "Cimitarra de Brasas",
        },
        "durability": 1400,
        "repair": "minecraft:blaze_rod",
        "enchant_value": 14,
    },
    {
        "id": "echo_maul",
        "bone": "maul",
        "names": {
            "en_US": "Echo Sonic Maul",
            "es_ES": "Mazo Sónico de Eco",
            "es_MX": "Mazo Sónico de Eco",
        },
        "durability": 2200,
        "repair": "minecraft:echo_shard",
        "enchant_value": 10,
    },
]

# ---------------------------------------------------------------------------
# Pixel art: sistema de coordenadas diagonal (t a lo largo del arma, w ancho)
# ---------------------------------------------------------------------------
SIZE = 32
START = (1.5, 30.5)  # esquina inferior izquierda (empuñadura)
D = (1 / math.sqrt(2), -1 / math.sqrt(2))  # direccion hacia la punta
N = (1 / math.sqrt(2), 1 / math.sqrt(2))  # perpendicular ("abajo-derecha" = w>0)


def to_tw(px, py):
    dx, dy = px + 0.5 - START[0], py + 0.5 - START[1]
    return dx * D[0] + dy * D[1], dx * N[0] + dy * N[1]


def hexc(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def shade(c, k):
    return (max(0, min(255, int(c[0] * k))), max(0, min(255, int(c[1] * k))),
            max(0, min(255, int(c[2] * k))), c[3])


def render(shape_fn):
    """shape_fn(t, w) -> color RGBA o None. Aplica sombreado por w y contorno."""
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = img.load()
    base = {}
    for y in range(SIZE):
        for x in range(SIZE):
            t, w = to_tw(x, y)
            c = shape_fn(t, w)
            if c is not None:
                base[(x, y)] = c
    for (x, y), c in base.items():
        edge = any((x + dx, y + dy) not in base for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        px[x, y] = shade(c, 0.55) if edge else c
    return img


def band(w, lo, hi):
    return lo <= w <= hi


# --- Glaive de amatista -----------------------------------------------------
def glaive_shape(t, w):
    wood, wood_l, wood_d = hexc("#3b2a4f"), hexc("#55406e"), hexc("#241733")
    silver, silver_d = hexc("#cfd3dc"), hexc("#8d93a3")
    am_l, am, am_d, am_core = hexc("#d7b6ff"), hexc("#a46ef0"), hexc("#6c3cb8"), hexc("#f4ecff")
    # asta
    if 0 <= t < 29.5 and band(w, -0.75, 0.75):
        if t < 1.2 or 4.5 < t < 5.6 or 8.0 < t < 9.1 or 26.5 < t < 27.8:
            return silver if w <= 0 else silver_d
        return wood_l if w < -0.25 else (wood if w < 0.3 else wood_d)
    # hoja principal (curva hacia w>0)
    if 27 <= t <= 45:
        u = (t - 27) / 18.0
        half = 0.6 + 3.0 * math.sin(math.pi * min(1.0, u * 1.1)) if u < 0.9 else 3.0 * (1 - (u - 0.9) / 0.1)
        center = 1.1 * u
        if abs(w - center) <= max(0.3, half):
            rel = (w - center) / max(0.3, half)
            if abs(rel) < 0.2 and 0.2 < u < 0.8:
                return am_core
            return am_l if rel < -0.45 else (am if rel < 0.4 else am_d)
    # pua trasera
    if 28.5 <= t <= 33 and band(w, -4.0 + (t - 28.5) * 0.75, -0.8):
        return am_l if w < -2.5 else (am if t < 31 else am_d)
    # engaste
    if 27.5 <= t <= 29.5 and band(w, -1.3, 1.3):
        return silver if w < 0 else silver_d
    return None


# --- Cimitarra de brasas -----------------------------------------------------
def scimitar_shape(t, w):
    leather, leather_d = hexc("#4a2a1d"), hexc("#2d1711")
    gold, gold_d, gold_l = hexc("#e2a93a"), hexc("#9a6a18"), hexc("#ffe28a")
    steel_d, steel = hexc("#3a2f33"), hexc("#5b4a4e")
    ember, ember_l, ember_core = hexc("#f06a16"), hexc("#ffb13b"), hexc("#fff3b0")
    # pomo + empuñadura
    if 0 <= t < 1.6 and band(w, -1.1, 1.1):
        return gold_l if w < 0 else gold
    if 1.6 <= t < 7.0 and band(w, -0.75, 0.75):
        return leather if (int(t) % 2 == 0) else leather_d
    # guarda
    if 7.0 <= t < 8.6 and band(w, -2.6, 2.6):
        return gold_l if w < -1.2 else (gold if w < 1 else gold_d)
    # hoja curva (filo en w<0, lomo en w>0)
    if 8.6 <= t <= 41.5:
        u = (t - 8.6) / 32.9
        center = 3.6 * u * u
        half = 1.5 if u < 0.65 else 1.5 * (1 - (u - 0.65) / 0.35) + 0.15
        if abs(w - center) <= half:
            rel = (w - center) / half
            glow = math.sin(t * 1.7) > 0.35
            if rel < -0.55:  # filo incandescente
                return ember_core if glow else ember_l
            if rel < 0.0:
                return ember if glow else ember_l
            return steel if rel < 0.55 else steel_d
    return None


# --- Mazo sonico de eco -------------------------------------------------------
def maul_shape(t, w):
    wood, wood_l, wood_d = hexc("#2f3038"), hexc("#474954"), hexc("#1c1d23")
    wrap, wrap_d = hexc("#1ea89b"), hexc("#0f6b63")
    slate, slate_l, slate_d = hexc("#4e5160"), hexc("#6b6f80"), hexc("#30323c")
    sculk, sculk_d, echo = hexc("#19b3a6"), hexc("#0b5a55"), hexc("#3fe0ff")
    # mango
    if 0 <= t < 26.5 and band(w, -0.8, 0.8):
        if t < 1.4:
            return slate_l if w < 0 else slate
        if 2.5 < t < 9.5 and int(t) % 2 == 1:
            return wrap if w < 0 else wrap_d
        return wood_l if w < -0.3 else (wood if w < 0.3 else wood_d)
    # cabeza (rectangulo ancho; cara de golpeo mas larga hacia w>0)
    if 26.5 <= t <= 36.5 and band(w, -4.2, 5.4):
        # vetas de sculk
        v = math.sin(t * 2.3 + w * 1.7) + math.cos(w * 2.9 - t * 0.8)
        if abs(t - 31.5) < 0.8 and abs(w - 0.6) < 0.8:
            return echo
        if v > 1.25:
            return sculk if (int(t + w) % 2 == 0) else sculk_d
        if w < -2.2:
            return slate_l
        if w > 4.2 or t > 35.3:
            return slate_d
        return slate
    return None


SHAPES = {
    "amethyst_glaive": glaive_shape,
    "blaze_scimitar": scimitar_shape,
    "echo_maul": maul_shape,
}

# ---------------------------------------------------------------------------
# Geometria a partir del sprite
# ---------------------------------------------------------------------------
PLAYER_BONES = [
    {"name": "root", "pivot": [0, 0, 0]},
    {"name": "waist", "parent": "root", "pivot": [0, 12, 0]},
    {"name": "body", "parent": "waist", "pivot": [0, 24, 0]},
    {"name": "head", "parent": "body", "pivot": [0, 24, 0]},
    {"name": "hat", "parent": "head", "pivot": [0, 24, 0]},
    {"name": "cape", "parent": "body", "pivot": [0, 24, 3]},
    {"name": "leftArm", "parent": "body", "pivot": [5, 22, 0]},
    {"name": "leftSleeve", "parent": "leftArm", "pivot": [5, 22, 0]},
    {"name": "leftItem", "parent": "leftArm", "pivot": [6, 15, 1]},
    {"name": "rightArm", "parent": "body", "pivot": [-5, 22, 0]},
    {"name": "rightSleeve", "parent": "rightArm", "pivot": [-5, 22, 0]},
    {"name": "rightItem", "parent": "rightArm", "pivot": [-6, 15, 1]},
    {"name": "jacket", "parent": "body", "pivot": [0, 24, 0]},
    {"name": "leftLeg", "parent": "root", "pivot": [1.9, 12, 0]},
    {"name": "leftPants", "parent": "leftLeg", "pivot": [1.9, 12, 0]},
    {"name": "rightLeg", "parent": "root", "pivot": [-1.9, 12, 0]},
    {"name": "rightPants", "parent": "rightLeg", "pivot": [-1.9, 12, 0]},
]


def build_geometry(wid, bone, img):
    px = img.load()
    solid = {(x, y) for y in range(SIZE) for x in range(SIZE) if px[x, y][3] > 0}
    cubes = [
        # plano cara -x (oeste): u crece hacia +z, asi que se espeja
        {"origin": [-6.49, 10, -26], "size": [0, 32, 32],
         "uv": {"west": {"uv": [32, 0], "uv_size": [-32, 32]}}},
        # plano cara +x (este): u crece hacia -z
        {"origin": [-5.49, 10, -26], "size": [0, 32, 32],
         "uv": {"east": {"uv": [0, 0], "uv_size": [32, 32]}}},
    ]
    # cubos 1x1x1 solo en el borde del sprite, y solo las caras expuestas
    for (c, r) in sorted(solid):
        faces = {}
        if (c, r - 1) not in solid:
            faces["up"] = {"uv": [c, r], "uv_size": [1, 1]}
        if (c, r + 1) not in solid:
            faces["down"] = {"uv": [c, r], "uv_size": [1, 1]}
        if (c + 1, r) not in solid:  # columna+1 => z menor => cara norte
            faces["north"] = {"uv": [c, r], "uv_size": [1, 1]}
        if (c - 1, r) not in solid:
            faces["south"] = {"uv": [c, r], "uv_size": [1, 1]}
        if not faces:
            continue
        cubes.append({"origin": [-6.5, 41 - r, 5 - c], "size": [1, 1, 1], "uv": faces})
    bones = [dict(b) for b in PLAYER_BONES]
    bones.insert(12, {
        "name": bone, "parent": "rightItem", "pivot": [-5, 15, 1], "rotation": [45, 0, 0], "cubes": cubes,
    })
    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": "geometry." + wid,
                "texture_width": 128, "texture_height": 128,
                "visible_bounds_width": 4, "visible_bounds_height": 4,
                "visible_bounds_offset": [0, 1, 0],
            },
            "bones": bones,
        }],
    }


# ---------------------------------------------------------------------------
# Animaciones (horneadas tick a tick)
# ---------------------------------------------------------------------------
# Cada canal se define con poses clave (tick, valor, curva). La curva describe
# como se LLEGA a esa pose:
#   "out"  sale rapido y frena      (anticipacion, inercia tras el golpe)
#   "in"   arranca lento y acelera  (el golpe en si)
#   "io"   suave en ambos extremos  (recuperacion)
# Se hornea a un keyframe lineal por tick (0.05 s): el resultado no depende de
# como interpole Bedrock y no hay sobrepasos raros de catmullrom.
# Todos los ataques empiezan y acaban en la pose neutra (0,0,0), asi no hay
# salto ni al empezar ni al encadenar el siguiente golpe del combo.
TICK = 0.05
Z = [0, 0, 0]


def _ease(u, mode):
    if mode == "out":
        return 1 - (1 - u) ** 2
    if mode == "in":
        return u ** 2.2
    if mode == "lin":
        return u
    return u * u * (3 - 2 * u)


def bake(keys, end):
    keys = sorted(keys, key=lambda k: k[0])
    if keys[0][0] != 0:
        keys.insert(0, (0, Z, "io"))
    if keys[-1][0] < end:
        keys.append((end, Z, "io"))
    out = {}
    for t in range(0, end + 1):
        for i in range(len(keys) - 1):
            a, b = keys[i], keys[i + 1]
            if a[0] <= t <= b[0]:
                u = (t - a[0]) / max(1, b[0] - a[0])
                mode = b[2] if len(b) > 2 else "io"
                if a[0] == 0 and mode == "out":
                    mode = "io"  # la anticipacion arranca suave desde neutro
                e = _ease(u, mode)
                v = [round(a[1][j] + (b[1][j] - a[1][j]) * e, 3) for j in range(3)]
                break
        ts = ("%.2f" % (t * TICK)).rstrip("0").rstrip(".")
        if "." not in ts:
            ts += ".0"
        out[ts] = v
    return out


def attack(end, bones):
    """bones: {hueso: {"rot": [(tick, [x,y,z], curva)...], "pos": [...]}}"""
    out = {}
    for name, ch in bones.items():
        b = {}
        if "rot" in ch:
            b["rotation"] = bake(list(ch["rot"]), end)
        if "pos" in ch:
            b["position"] = bake(list(ch["pos"]), end)
        out[name] = b
    return {"loop": "hold_on_last_frame", "animation_length": round(end * TICK, 2), "bones": out}


def idle(bone, amp=1.0):
    return {
        "loop": True,
        "bones": {
            bone: {"rotation": [
                "math.sin(query.life_time * 70) * %.2f" % (1.2 * amp),
                "math.cos(query.life_time * 55) * %.2f" % (1.0 * amp),
                0,
            ]}
        },
    }


def strike(win, hit, fol, end, bones):
    """Atajo para el patron anticipacion -> golpe -> inercia -> recuperacion.

    bones: {hueso: {"rot": (W, S, F), "pos": (W, S, F)}} con W = pose de
    anticipacion (tick win), S = pose en el impacto (tick hit) y F = pose de
    inercia (tick fol). Vuelve a neutro en `end`.
    """
    out = {}
    for name, ch in bones.items():
        out[name] = {}
        for key in ("rot", "pos"):
            if key in ch:
                w, s, f = ch[key]
                out[name][key] = [(0, Z), (win, w, "out"), (hit, s, "in"), (fol, f, "out"), (end, Z, "io")]
    return attack(end, out)


# Tiempos (en ticks) de cada ataque nuevo: (anticipacion, impacto, inercia, fin).
# El script (BP/scripts/main.js) usa los mismos valores para hitFrames/attackTime.
TIMING = {
    "amethyst_glaive": [(4, 7, 10, 16), (5, 8, 11, 18), (6, 10, 13, 21)],
    "blaze_scimitar": [(3, 6, 8, 13), (3, 6, 8, 13), (4, 8, 11, 18)],
    "echo_maul": [(7, 11, 14, 23), (6, 10, 13, 21), (5, 13, 16, 27)],
}


def glaive_anims():
    t = TIMING["amethyst_glaive"]
    a = {"idle": idle("glaive")}
    # 1) estocada: recoge el asta hacia atras y la clava al frente
    a["attack"] = strike(*t[0], {
        "root": {"pos": ([0, 0, 1.5], [0, -0.5, -2.5], [0, -0.3, -1.5])},
        "waist": {"rot": ([0, -12, 0], [5, 14, 0], [3, 9, 0])},
        "body": {"rot": ([-4, -20, 0], [9, 22, 0], [6, 14, 0])},
        "head": {"rot": ([0, 18, 0], [-6, -16, 0], [-3, -9, 0])},
        "rightArm": {"rot": ([-38, -26, 10], [-98, 6, 2], [-88, 2, 2]),
                     "pos": ([0, 0, 3], [1, 0, -3.5], [0.5, 0, -2])},
        "leftArm": {"rot": ([-52, 34, 0], [-90, 16, 0], [-80, 18, 0]),
                    "pos": ([-1, 0, 1], [-3, 0, -2.5], [-2, 0, -1.5])},
        "rightItem": {"rot": ([4, 0, 0], [-8, 0, 0], [-4, 0, 0])},
        "leftLeg": {"rot": ([8, 0, 0], [-24, 0, 0], [-16, 0, 0]), "pos": ([0, 0, 0], [0, 0, -2], [0, 0, -1.2])},
        "rightLeg": {"rot": ([-6, 0, 0], [20, 0, 0], [12, 0, 0])},
    })
    # 2) barrido horizontal amplio de derecha a izquierda
    a["attack1"] = strike(*t[1], {
        "root": {"pos": ([0, 0, 0.5], [0, -1, -1], [0, -0.8, -0.8])},
        "waist": {"rot": ([0, 24, 0], [4, -14, 0], [4, -24, 0])},
        "body": {"rot": ([-4, 38, 0], [6, -20, 0], [5, -34, 0])},
        "head": {"rot": ([0, -24, 0], [-3, 14, 0], [-3, 24, 0])},
        "rightArm": {"rot": ([-92, 70, 8], [-92, -30, 2], [-88, -58, 0]),
                     "pos": ([0, 0, 1], [1, 0, -2], [1, 0, -1.5])},
        "leftArm": {"rot": ([-84, 50, -4], [-88, -10, 2], [-84, -26, 4]),
                    "pos": ([-2, 0, 0], [-3, 0, -1], [-3, 0, -1])},
        "rightItem": {"rot": ([0, 0, 12], [0, 0, -6], [0, 0, -16])},
        "leftLeg": {"rot": ([0, 12, 0], [-12, -4, 0], [-14, -8, 0])},
        "rightLeg": {"rot": ([0, 12, 0], [10, -4, 0], [12, -8, 0])},
    })
    # 3) tajo descendente a dos manos
    a["attack2"] = strike(*t[2], {
        "root": {"pos": ([0, 1, 0.5], [0, -2, -1], [0, -1.6, -1])},
        "waist": {"rot": ([-10, -6, 0], [16, 4, 0], [12, 3, 0])},
        "body": {"rot": ([-16, -10, 0], [26, 6, 0], [19, 4, 0])},
        "head": {"rot": ([12, 0, 0], [-14, 0, 0], [-8, 0, 0])},
        "rightArm": {"rot": ([-176, -14, 12], [-60, 0, 6], [-50, 0, 6]),
                     "pos": ([0, 1, 1], [1, -1, -2], [1, -1.2, -1.5])},
        "leftArm": {"rot": ([-166, 22, -12], [-56, 12, -6], [-46, 12, -6]),
                    "pos": ([-2, 1, 0], [-3, -1, -2], [-3, -1.2, -1.5])},
        "rightItem": {"rot": ([12, 0, 0], [-18, 0, 0], [-22, 0, 0])},
        "leftLeg": {"rot": ([6, 0, 0], [-28, 0, 0], [-20, 0, 0]), "pos": ([0, 0, 0], [0, 0, -3], [0, 0, -2])},
        "rightLeg": {"rot": ([-4, 0, 0], [18, 0, 0], [12, 0, 0])},
    })
    return a


def scimitar_anims():
    t = TIMING["blaze_scimitar"]
    a = {"idle": idle("scimitar", 1.3)}
    # 1) tajo horizontal rapido (derecha -> izquierda)
    a["attack"] = strike(*t[0], {
        "root": {"pos": ([0, 0, 0.5], [0, -0.3, -1.2], [0, -0.2, -0.8])},
        "waist": {"rot": ([0, -20, 0], [2, 12, 0], [2, 20, 0])},
        "body": {"rot": ([-4, -32, 0], [6, 16, 0], [5, 28, 0])},
        "head": {"rot": ([0, 20, 0], [-3, -10, 0], [-3, -18, 0])},
        "rightArm": {"rot": ([-96, -52, 16], [-90, 20, 6], [-80, 48, 4]),
                     "pos": ([0, 0, 1], [0, 0, -2], [0, 0, -1.5])},
        "leftArm": {"rot": ([-14, 12, -10], [-30, -8, -20], [-36, -12, -24])},
        "rightItem": {"rot": ([0, 0, 14], [6, 0, -20], [8, 0, -34])},
        "leftLeg": {"rot": ([0, 8, 0], [-10, -4, 0], [-12, -6, 0])},
        "rightLeg": {"rot": ([0, 8, 0], [8, -4, 0], [10, -6, 0])},
    })
    # 2) reves (izquierda -> derecha)
    a["attack1"] = strike(*t[1], {
        "root": {"pos": ([0, 0, 0.5], [0, -0.3, -1.2], [0, -0.2, -0.8])},
        "waist": {"rot": ([0, 22, 0], [2, -12, 0], [2, -20, 0])},
        "body": {"rot": ([-4, 34, 0], [6, -16, 0], [5, -28, 0])},
        "head": {"rot": ([0, -20, 0], [-3, 10, 0], [-3, 18, 0])},
        "rightArm": {"rot": ([-98, 62, 8], [-86, -20, 12], [-78, -46, 14]),
                     "pos": ([0, 0, 1], [1, 0, -2], [1, 0, -1.5])},
        "leftArm": {"rot": ([-30, -10, -20], [-20, 8, -14], [-16, 12, -12])},
        "rightItem": {"rot": ([0, 0, -26], [-6, 0, 22], [-8, 0, 38])},
        "leftLeg": {"rot": ([0, -8, 0], [10, 4, 0], [12, 6, 0])},
        "rightLeg": {"rot": ([0, -8, 0], [-8, 4, 0], [-10, 6, 0])},
    })
    # 3) tajo ascendente con pequeño salto
    e = t[2][3]
    a["attack2"] = attack(e, {
        "root": {"pos": [(0, Z), (4, [0, -1.8, 0], "out"), (8, [0, 2.6, -1], "out"), (12, [0, -0.6, -1], "in"), (e, Z, "io")]},
        "waist": {"rot": [(0, Z), (4, [12, 6, 0], "out"), (8, [-14, -4, 0], "in"), (11, [-8, -2, 0], "out"), (e, Z, "io")]},
        "body": {"rot": [(0, Z), (4, [18, 10, 0], "out"), (8, [-20, -8, 0], "in"), (11, [-12, -4, 0], "out"), (e, Z, "io")]},
        "head": {"rot": [(0, Z), (4, [-10, 0, 0], "out"), (8, [12, 0, 0], "in"), (e, Z, "io")]},
        "rightArm": {"rot": [(0, Z), (4, [30, 4, 26], "out"), (8, [-158, -18, 10], "in"), (11, [-126, -6, 6], "out"), (e, Z, "io")],
                     "pos": [(0, Z), (4, [0, 0, 2], "out"), (8, [0, 1, -2], "in"), (e, Z, "io")]},
        "leftArm": {"rot": [(0, Z), (4, [22, 0, -26], "out"), (8, [-60, 10, -30], "in"), (11, [-40, 6, -22], "out"), (e, Z, "io")]},
        "rightItem": {"rot": [(0, Z), (4, [22, 0, 0], "out"), (8, [-34, 0, 0], "in"), (11, [-24, 0, 0], "out"), (e, Z, "io")]},
        "leftLeg": {"rot": [(0, Z), (4, [26, 0, 0], "out"), (8, [-30, 0, 0], "in"), (12, [-8, 0, 0], "out"), (e, Z, "io")]},
        "rightLeg": {"rot": [(0, Z), (4, [26, 0, 0], "out"), (8, [-14, 0, 0], "in"), (12, [6, 0, 0], "out"), (e, Z, "io")]},
    })
    return a


def maul_anims():
    t = TIMING["echo_maul"]
    a = {"idle": idle("maul", 0.8)}
    # 1) golpe descendente pesado
    a["attack"] = strike(*t[0], {
        "root": {"pos": ([0, 1, 1], [0, -2.6, -1], [0, -2, -1])},
        "waist": {"rot": ([-12, -4, 0], [19, 2, 0], [14, 2, 0])},
        "body": {"rot": ([-18, -8, 0], [28, 4, 0], [20, 4, 0])},
        "head": {"rot": ([14, 0, 0], [-16, 0, 0], [-9, 0, 0])},
        "rightArm": {"rot": ([-184, -16, 18], [-66, 0, 10], [-58, 0, 10]),
                     "pos": ([0, 1, 2], [1, -1, -2], [1, -1.3, -1.6])},
        "leftArm": {"rot": ([-174, 20, -18], [-60, 10, -10], [-52, 10, -10]),
                    "pos": ([-2, 1, 0], [-3, -1, -2], [-3, -1.3, -1.6])},
        "rightItem": {"rot": ([14, 0, 0], [-20, 0, 0], [-26, 0, 0])},
        "leftLeg": {"rot": ([8, 0, 0], [-32, 0, 0], [-24, 0, 0]), "pos": ([0, 0, 0], [0, 0, -3], [0, 0, -2.2])},
        "rightLeg": {"rot": ([-6, 0, 0], [22, 0, 0], [16, 0, 0])},
    })
    # 2) barrido lateral con todo el cuerpo
    a["attack1"] = strike(*t[1], {
        "root": {"pos": ([0, 0, 1], [0, -1.5, -1], [0, -1.2, -0.8])},
        "waist": {"rot": ([2, -34, 0], [6, 16, 0], [5, 28, 0])},
        "body": {"rot": ([-2, -46, 0], [8, 22, 0], [6, 40, 0])},
        "head": {"rot": ([0, 28, 0], [-5, -14, 0], [-5, -26, 0])},
        "rightArm": {"rot": ([-66, 86, 26], [-74, -24, 14], [-72, -58, 12]),
                     "pos": ([0, 0, 2], [1, 0, -2], [1, 0, -1.6])},
        "leftArm": {"rot": ([-64, 62, 0], [-72, -16, 5], [-70, -38, 6]),
                    "pos": ([-2, 0, 1], [-3, 0, -2], [-3, 0, -1.6])},
        "rightItem": {"rot": ([0, 0, 16], [0, 0, -8], [0, 0, -20])},
        "leftLeg": {"rot": ([0, 16, 0], [-14, -6, 0], [-16, -10, 0])},
        "rightLeg": {"rot": ([0, 16, 0], [12, -6, 0], [14, -10, 0])},
    })
    # 3) se agacha, salta y revienta el suelo
    e = t[2][3]
    a["attack2"] = attack(e, {
        "root": {"pos": [(0, Z), (5, [0, -2.2, 0], "out"), (9, [0, 4, -1], "out"), (13, [0, -3, -2], "in"), (16, [0, -2.4, -2], "out"), (e, Z, "io")]},
        "waist": {"rot": [(0, Z), (5, [14, 0, 0], "out"), (9, [-14, 0, 0], "out"), (13, [23, 0, 0], "in"), (16, [17, 0, 0], "out"), (e, Z, "io")]},
        "body": {"rot": [(0, Z), (5, [18, 0, 0], "out"), (9, [-20, 0, 0], "out"), (13, [33, 0, 0], "in"), (16, [24, 0, 0], "out"), (e, Z, "io")]},
        "head": {"rot": [(0, Z), (5, [-10, 0, 0], "out"), (9, [16, 0, 0], "out"), (13, [-20, 0, 0], "in"), (e, Z, "io")]},
        "rightArm": {"rot": [(0, Z), (5, [34, 0, 16], "out"), (9, [-174, -6, 14], "out"), (13, [-84, 0, 10], "in"), (16, [-76, 0, 10], "out"), (e, Z, "io")],
                     "pos": [(0, Z), (9, [0, 1, 1], "out"), (13, [1, -1, -3], "in"), (e, Z, "io")]},
        "leftArm": {"rot": [(0, Z), (5, [34, 0, -16], "out"), (9, [-164, 8, -14], "out"), (13, [-78, 8, -10], "in"), (16, [-70, 8, -10], "out"), (e, Z, "io")],
                    "pos": [(0, Z), (9, [-2, 1, 1], "out"), (13, [-3, -1, -3], "in"), (e, Z, "io")]},
        "rightItem": {"rot": [(0, Z), (9, [16, 0, 0], "out"), (13, [-24, 0, 0], "in"), (16, [-30, 0, 0], "out"), (e, Z, "io")]},
        "leftLeg": {"rot": [(0, Z), (5, [24, 0, 0], "out"), (9, [-30, 0, 0], "out"), (13, [-36, 0, 0], "in"), (e, Z, "io")],
                    "pos": [(0, Z), (13, [0, 0, -4], "in"), (e, Z, "io")]},
        "rightLeg": {"rot": [(0, Z), (5, [24, 0, 0], "out"), (9, [-20, 0, 0], "out"), (13, [26, 0, 0], "in"), (e, Z, "io")]},
    })
    return a


ANIMS = {
    "amethyst_glaive": glaive_anims,
    "blaze_scimitar": scimitar_anims,
    "echo_maul": maul_anims,
}

# ---------------------------------------------------------------------------
# Archivos JSON
# ---------------------------------------------------------------------------
def attachable(wid):
    return {
        "format_version": "1.10.0",
        "minecraft:attachable": {
            "description": {
                "identifier": "resonance:" + wid,
                "materials": {"default": "entity_alphatest_glint", "enchanted": "entity_alphatest_glint"},
                "textures": {"default": "textures/models/" + wid, "enchanted": "textures/misc/enchanted_item_glint"},
                "geometry": {"default": "geometry." + wid},
                "animations": {wid + ".idle": "animation.%s.idle" % wid},
                "scripts": {
                    "pre_animation": [
                        "variable.%s = (query.is_in_ui || (variable.is_paperdoll ?? 0)) ? 0 : query.is_item_name_any('slot.weapon.mainhand', 0, 'resonance:%s');" % (wid, wid)
                    ],
                    "animate": [{wid + ".idle": "!c.is_first_person && (variable.%s ?? 0)" % wid}],
                    "initialize": ["variable.%s = 0.0;" % wid],
                },
                "render_controllers": ["controller.render.item_default"],
                "item": {"resonance:" + wid: "(1.0)"},
            }
        },
    }


def item_json(w):
    wid = w["id"]
    return {
        "format_version": "1.20.80",
        "minecraft:item": {
            "description": {
                "identifier": "resonance:" + wid,
                "menu_category": {"category": "equipment", "group": "itemGroup.name.sword"},
            },
            "components": {
                "minecraft:max_stack_size": 1,
                "minecraft:hand_equipped": True,
                "minecraft:can_destroy_in_creative": False,
                "minecraft:durability": {"max_durability": w["durability"]},
                "minecraft:icon": "resonance_" + wid,
                "minecraft:damage": 0,
                "minecraft:enchantable": {"value": w["enchant_value"], "slot": "sword"},
                "minecraft:repairable": {
                    "repair_items": [
                        {"items": [w["repair"]], "repair_amount": "query.max_durability * 0.2"},
                        {"items": ["resonance:" + wid],
                         "repair_amount": "context.other->query.remaining_durability + 0.1 * context.other->query.max_durability"},
                    ]
                },
                "minecraft:digger": {"use_efficiency": True,
                                     "destroy_speeds": [{"block": "minecraft:web", "speed": 15}]},
            },
        },
    }


def dump(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def update_shared_files():
    ids = [w["id"] for w in WEAPONS]
    # item_texture.json
    p = os.path.join(RP, "textures", "item_texture.json")
    d = load(p)
    for wid in ids:
        d["texture_data"]["resonance_" + wid] = {"textures": "textures/items/" + wid}
    dump(p, d)
    # lang
    for lang in ("en_US", "es_ES", "es_MX"):
        p = os.path.join(RP, "texts", lang + ".lang")
        with open(p, encoding="utf-8") as fh:
            lines = [l.rstrip("\n") for l in fh]
        for w in WEAPONS:
            key = "item.resonance:%s=" % w["id"]
            lines = [l for l in lines if not l.startswith(key)]
            lines.append(key + w["names"][lang])
        with open(p, "w", encoding="utf-8") as fh:
            fh.write("\n".join(l for l in lines if l.strip()) + "\n")
    # player.animation_controllers.json: excluir el swing vanilla
    p = os.path.join(RP, "animation_controllers", "player.animation_controllers.json")
    with open(p, encoding="utf-8") as fh:
        s = fh.read()
    anchor = "'resonance:lunar_crescent'"
    extra = ", ".join("'resonance:%s'" % wid for wid in ids)
    if ids[0] not in s:
        s = s.replace(anchor, anchor + ", " + extra)
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(s)


def main():
    for w in WEAPONS:
        wid = w["id"]
        img = render(SHAPES[wid])
        img.save(os.path.join(RP, "textures", "items", wid + ".png"))
        tex = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        tex.paste(img, (0, 0))
        tex.save(os.path.join(RP, "textures", "models", wid + ".png"))
        dump(os.path.join(RP, "models", "entity", wid + ".geo.json"), build_geometry(wid, w["bone"], img))
        dump(os.path.join(RP, "attachables", wid + ".json"), attachable(wid))
        anims = ANIMS[wid]()
        dump(os.path.join(RP, "animations", wid + ".animation.json"), {
            "format_version": "1.8.0",
            "animations": {"animation.%s.%s" % (wid, k): v for k, v in anims.items()},
        })
        dump(os.path.join(BP, "items", wid + ".json"), item_json(w))
        print("generado", wid, "cubos:", len(load(os.path.join(RP, "models", "entity", wid + ".geo.json"))
              ["minecraft:geometry"][0]["bones"][12]["cubes"]))
    update_shared_files()


if __name__ == "__main__":
    main()
