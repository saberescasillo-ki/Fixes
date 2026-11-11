#!/usr/bin/env python3
"""Empaqueta BP/ y RP/ en dist/Resonance_Armory_<version>.mcaddon (+ .mcpack).

Uso: python3 tools/build.py [--bump]   (desde resonance_armory/)
  --bump  incrementa el ultimo numero de version en ambos manifests
          (header, modules y dependencias cruzadas) antes de empaquetar.
"""
import json
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
PACKS = ("BP", "RP")


def load(p):
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


def dump(p, d):
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(d, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def bump():
    manifests = {k: load(os.path.join(ROOT, k, "manifest.json")) for k in PACKS}
    v = list(manifests["BP"]["header"]["version"])
    v[-1] += 1
    uuids = {m["header"]["uuid"] for m in manifests.values()}
    for k, m in manifests.items():
        m["header"]["version"] = v
        for mod in m.get("modules", []):
            mod["version"] = v
        for dep in m.get("dependencies", []):
            if dep.get("uuid") in uuids:
                dep["version"] = v
        dump(os.path.join(ROOT, k, "manifest.json"), m)
    return v


def zip_dir(src, dst):
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
        for base, dirs, files in os.walk(src):
            dirs[:] = [d for d in dirs if d != "__pycache__"]
            for f in sorted(files):
                full = os.path.join(base, f)
                z.write(full, os.path.relpath(full, src))


def main():
    if "--bump" in sys.argv:
        print("version ->", bump())
    v = load(os.path.join(ROOT, "BP", "manifest.json"))["header"]["version"]
    tag = ".".join(map(str, v))
    os.makedirs(DIST, exist_ok=True)
    packs = []
    for k in PACKS:
        out = os.path.join(DIST, "Resonance_Armory_%s_%s.mcpack" % (k, tag))
        zip_dir(os.path.join(ROOT, k), out)
        packs.append(out)
    addon = os.path.join(DIST, "Resonance_Armory_%s.mcaddon" % tag)
    with zipfile.ZipFile(addon, "w", zipfile.ZIP_DEFLATED) as z:
        for p in packs:
            z.write(p, os.path.basename(p).replace("_%s" % tag, "").replace("Resonance_Armory_", "").lower())
    print("ok", addon)


if __name__ == "__main__":
    main()
