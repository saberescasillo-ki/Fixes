# Fixes

## FAnimation Update 7 (fieryabyss × Fiery Combat) – arreglado

- `FAnimation/` – el pack arreglado. `dist/FAnimation_Update7_fix_0.1.0.mcpack` para instalar.
- `FAnimation_original/` – el pack tal como llegó.
- `tools/build_fanim.py` lo genera desde el original; `tools/check_fanim.py` valida referencias.

### Capa: opciones (botón ⚙ del pack → subpacks)

| Opción | Capa custom de FAnimation | Espadas/herramientas en la espalda |
|---|---|---|
| **Default** (preseleccionada) | Sí, **solo si tu skin no trae capa** | Sí |
| **Capa de tu skin / Marketplace** | No, nunca | Sí |
| Sin accesorios en la espalda | Solo si tu skin no trae capa | No |
| Sin capa custom ni accesorios | No, nunca | No |

La capa de tu skin (marketplace, Minecoins, Creador de Personajes) usa la geometría
segmentada del pack, así que conserva la animación de ondeo.

### Errores corregidos

| Problema | Arreglo |
|---|---|
| El subpack por defecto (`no cape & tool`, el último de la lista) **no existía** → `Invalid render controller: controller.render.swordd_n … cape` en el log. Los otros subpacks también dejaban controladores sin definir. | 4 subpacks reales; cada uno define los 21 render controllers (los apagados son “vacíos”), así nunca falta ninguno. |
| La capa custom se dibujaba **encima** de la capa del skin (marketplace). | Se oculta si el skin trae capa (`query.has_cape`) y hay un subpack para apagarla del todo. |
| Cuerpo del jugador con `Material.glow` (`entity_emissive_alpha`) y faltaban los materiales `animated` y `spectator` → skins del marketplace con píxeles semitransparentes/animados se veían mal y el modo espectador no tenía material. | Render controllers y materiales del jugador iguales a vanilla 1.26 (se mantiene sin destello rojo al recibir daño, como quería el autor). Falta de textura `cape` añadida. |
| Capa de “sombrero” del skin siempre visible aunque llevaras casco. | `helmet_layer_visible = !query.has_head_gear` como vanilla. |
| `unknown variable 'temp.i'` (`variable.shield` usaba `t.i` fuera de un bucle). | Revisa los 9 espacios de la barra rápida. |
| `unknown variable 'variable.melee_spear_equipped'`. | Se define en `pre_animation`. |
| Accesorios en la espalda: bucle de 27 sobre una barra de 9 y `slot.weapon.mainhand` con índice > 0 → **la espada que sostenías también aparecía en tu espalda**. | Condición simple: está en la barra rápida y no en la mano. Sin bucles (más ligero). |
| Sobrescribía `controller.animation.humanoid.brandish_spear` con una versión que lee `variable.trident` → **ahogados, esqueletos, strays, bogged, vex, piglins** perdían la pose del tridente/lanza y llenaban el log de errores. | El del pack ahora es `controller.animation.fanim.brandish_spear`; los mobs usan el vanilla. Igual con `crossbow` y `root` (ids propios). |
| El latido aparecía dos veces en `animate`, una sin condición, y la animación no tenía duración → **sonaba sin parar**. | Una sola vez, con `health <= 2`, y duración 0.9 s. |
| Animaciones inexistentes: `armor_cape`, `time_25`, `p.dagger_pose`, `p.fly`, `fall_bs`, `ground_bs`, `hurt2`, `climb`; `halbert.attack3` apuntaba a `chalbert_attack3` (errata). | `time_25` creada (temporizador del combo de lanza), errata corregida, el resto quitado (no venían en el pack; `armor_cape` ya la anima `animation.player.cape`). |
| Controladores `attack.dagger` / `attack.halbert2`: transición a un estado `3` que no existe. | Quitada (era inalcanzable). |
| Partícula `fiery:blood` inexistente; textura `herobrine_sword` inexistente. | Referencias quitadas (nadie las usaba). |
| `first_person_attack` / `first_person_map` eran copias de vanilla. | Eliminadas: se usa vanilla. Primera persona del root actualizada a 1.26 (lanza, escudo). |
| Faltaba `riding.root` (altura correcta en bote/vagoneta) y `holding_heavy_core`. | Añadidos. |
| Archivos que el juego no lee: `back_sword.json` en la raíz, `.mcattributes`, `heartbeat.MP3` (formato no soportado), `sword_stabswadwda.ogg`. | Eliminados. |

Notas: las texturas de vainas/espadas de *Fiery Combat* (`nichirin_sheath`, etc.) vienen
en ese addon; sin él esos objetos no existen y no se dibujan. La animación de proyectiles
girando (`animation.actor.billboard`) es del autor y se dejó tal cual.

---

## Player Action Optimization (KID_SKY) – actualizado (descartado)

Pack de recursos de animaciones de jugador para **Minecraft Bedrock**, actualizado de la
versión 0.4.1 (era 1.16/1.17) a la **0.5.0** para Bedrock **1.26.x** (probado contra los
archivos vanilla de Mojang `1.26.60.5`).

- `Player_Action_Optimization/` – el pack arreglado (carpeta para `resource_packs/`).
- `dist/Player_Action_Optimization_0.5.0.mcpack` – listo para instalar con doble clic.
- `original/` – el pack original, sin tocar, como referencia.
- `tools/` – scripts que generan y validan el pack a partir del original.

### Errores corregidos

| # | Problema en el original | Arreglo |
|---|---|---|
| 1 | `animations.json` y `animation_controllers.json` no eran JSON válido (comentarios `/*/ … /*/`). El de controladores tenía una copia duplicada del controlador `look_at_target` dentro del comentario. | JSON estricto, formateado y legible. Se quitó el duplicado. |
| 2 | `manifest.json` con `format_version: 1` y sin `min_engine_version`. | `format_version: 2`, `min_engine_version: [1, 26, 0]`, `metadata.authors`. Versión 0.5.0 (mismos UUID, así se actualiza encima del anterior). |
| 3 | `pack_icon.png` era en realidad un **JPEG** de 1920×1920 (384 KB). | PNG real de 256×256. |
| 4 | **Rompía a los mobs**: sobrescribía animaciones vanilla compartidas (`humanoid.base_pose`, `look_at_target.*`, `skeleton.attack`, `brandish_spear`, `damage_nearby_mobs`, `use_item_progress` y el controlador `humanoid.look_at_target`). Zombis, esqueletos, ahogados, piglins, vindicadores, etc. dejaban de girar la cabeza y usaban las poses del jugador. | Todas las animaciones/controladores del pack tienen IDs propios (`animation.kid_sky.*`, `controller.animation.kid_sky.*`) y el pack incluye su propio `entity/player.entity.json` (basado en el vanilla más reciente). Los mobs vuelven a ser vanilla. |
| 5 | Secuestraba `controller.animation.persona.blink` para la lógica de ataque → las skins del Creador de Personajes no parpadeaban, y con skins persona el ataque y el giro de cabeza podían no reproducirse (`!variable.use_blinking_animation`). | El controlador de ataque es ahora `controller.animation.kid_sky.player.attack` y se reproduce siempre en tercera persona. El parpadeo vanilla queda intacto. |
| 6 | El controlador raíz era una copia de la era 1.16: sin estado de **inventario (paperdoll)**, sin **icono de mapa**, primera persona antigua (usaba el ítem `'map'`, que ahora se llama `'filled_map'`, y sin bloqueo con escudo en 1ª persona). | Raíz reconstruida desde la vanilla 1.26: `first_person`, `paperdoll`, `map_player` y `third_person`, con la lógica del pack dentro de tercera persona. |
| 7 | No tenía nada para las mecánicas nuevas: **gatear** (crawl), **cuerno de cabra**, **pincel**, **heavy core**, **lanza (spear)**, desplazamiento al ir en **bote/vagoneta** (`riding.root`). | Añadidas con las animaciones vanilla. Las animaciones del pack se pausan mientras gateas, y los ataques/“usar ítem” del pack ceden el paso a la lanza, el cuerno y el pincel. |
| 8 | Las animaciones del pack se mezclaban con los **emotes**. | Se desactivan mientras haces un emote (`!query.is_emoting`), como hace vanilla con la cabeza. |
| 9 | `hudplayer`: error de precedencia (`a \|\| b \|\| c && d`) que mandaba al estado de “caída” durante un frame cada vez que entrabas al agua, montabas o dormías. | Condiciones separadas: agua/montura/cama → estado por defecto; caída → solo en el aire. |
| 10 | `on_entry` reiniciaba `variable.is_holding_spyglass = 0.0` (variable que hoy controla el motor). | Eliminado. |
| 11 | `look_at_target.inverted`: último keyframe (0.5417) después del final (0.54167). | `animation_length` 0.5417. |

### Notas

- Las animaciones `animation.kid_sprint_ground_plus`, `animation.kid_armor_plus` y
  `animation.kid_hit_plus` ya estaban en el original pero **ningún controlador las usa**;
  se conservan sin cambios.
- Al incluir `player.entity.json`, si una futura versión de Minecraft añade animaciones
  nuevas al jugador, habrá que regenerar el pack con `tools/` para recogerlas.

### Regenerar / validar

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/Mojang/bedrock-samples.git /tmp/bs
git -C /tmp/bs sparse-checkout set resource_pack/entity resource_pack/animations resource_pack/animation_controllers
python3 -I tools/build.py original /tmp/bs/resource_pack Player_Action_Optimization
python3 -I tools/check.py Player_Action_Optimization /tmp/bs/resource_pack
```

`check.py` verifica: JSON estricto sin claves duplicadas, que el pack no pise ningún ID
vanilla, que todo nombre corto usado en los controladores exista en la entidad, que todas
las transiciones apunten a estados existentes y que los paréntesis Molang estén balanceados.
