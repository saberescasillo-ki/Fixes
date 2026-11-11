// scripts/armory/coal/smoke_club.ts
import { world, system as system4, EntityDamageCause, EntityComponentTypes, EquipmentSlot } from "@minecraft/server";

// scripts/systems/cooldown.ts
import { system } from "@minecraft/server";
var cooldowns = /* @__PURE__ */ new Map();
function isOnCooldown(entity, key) {
  const until = cooldowns.get(`${entity.id}:${key}`);
  return until !== void 0 && system.currentTick < until;
}
function withCooldown(entity, key, ticks, action) {
  if (isOnCooldown(entity, key)) return;
  cooldowns.set(`${entity.id}:${key}`, system.currentTick + ticks);
  try {
    action();
  } catch (e) {
    console.warn(`[Resonance] ${key}: ${e}`);
  }
}
function clearCooldowns(entity) {
  const prefix = `${entity.id}:`;
  for (const k of [...cooldowns.keys()]) if (k.startsWith(prefix)) cooldowns.delete(k);
  try {
    for (const tag of entity.getTags()) if (tag.startsWith("cd_")) entity.removeTag(tag);
  } catch {
  }
}

// scripts/systems/vanilla_hit.ts
var RESONANCE_WEAPONS = [
  "resonance:smoke_club",
  "resonance:iron_halberd",
  "resonance:golden_rapier",
  "resonance:copper_hammer",
  "resonance:diamond_greatsword",
  "resonance:netherite_relic_blade",
  "resonance:redstone_pulse_gauntlet",
  "resonance:lunar_crescent",
  "resonance:amethyst_glaive",
  "resonance:blaze_scimitar",
  "resonance:echo_maul"
];
var scriptedDamageDepth = 0;
function dealDamage(target, amount, options) {
  scriptedDamageDepth++;
  try {
    return target.applyDamage(amount, options);
  } finally {
    scriptedDamageDepth--;
  }
}
function isHoldingResonanceWeapon(player) {
  try {
    const id = player.getComponent("minecraft:equippable")?.getEquipment("Mainhand")?.typeId;
    return !!id && RESONANCE_WEAPONS.includes(id);
  } catch {
    return false;
  }
}
var weaponHitHandlers = [];
var lastHitDispatchTick = /* @__PURE__ */ new Map();
function onWeaponHit(handler) {
  weaponHitHandlers.push(handler);
}
function dispatchWeaponHit(ev) {
  const attacker = ev.damagingEntity;
  if (!attacker || !ev.hitEntity) return;
  if (lastHitDispatchTick.get(attacker.id) === system.currentTick) return;
  lastHitDispatchTick.set(attacker.id, system.currentTick);
  for (const handler of weaponHitHandlers) {
    try {
      handler(ev);
    } catch (e) {
      console.warn(`[Resonance] hit: ${e}`);
    }
  }
}
world.afterEvents.entityHitEntity.subscribe(dispatchWeaponHit);
world.beforeEvents.entityHurt.subscribe((ev) => {
  if (scriptedDamageDepth > 0) return;
  const attacker = ev.damageSource.damagingEntity;
  if (!attacker || attacker.typeId !== "minecraft:player" || ev.damageSource.damagingProjectile) return;
  if (!isHoldingResonanceWeapon(attacker)) return;
  ev.cancel = true;
  const hitEntity = ev.hurtEntity;
  system.run(() => {
    const last = lastHitDispatchTick.get(attacker.id);
    if (last !== void 0 && system.currentTick - last <= 1) return;
    try {
      if (attacker.isValid && hitEntity.isValid) dispatchWeaponHit({ damagingEntity: attacker, hitEntity });
    } catch {
    }
  });
}, { allowedDamageCauses: [EntityDamageCause.entityAttack] });

// scripts/utils/area_effect.ts
function applyAreaEffect(dimension, center, radius, effects, source) {
  const entities = dimension.getEntities({
    location: center,
    maxDistance: radius,
    excludeTypes: ["minecraft:item", "minecraft:xp_orb"]
  });
  for (const entity of entities) {
    if (source && entity.id === source.id) continue;
    for (const effect of effects) {
      try {
        entity.addEffect(effect.type, effect.duration, {
          amplifier: effect.level ?? 0,
          showParticles: false
        });
      } catch {
      }
    }
  }
}

// scripts/utils/particles.ts
function spawnSmoke(dimension, center, count = 5) {
  for (let i = 0; i < count; i++) {
    dimension.spawnParticle("minecraft:campfire_smoke_particle", {
      x: center.x + Math.random() - 0.5,
      y: center.y,
      z: center.z + Math.random() - 0.5
    });
  }
}

// scripts/utils/safe_tick.ts
function safeTick(fn) {
  return (player) => {
    try {
      fn(player);
    } catch (e) {
      console.warn(`[Resonance] ${fn.name}: ${e}`);
    }
  };
}

// scripts/utils/input_lock.ts
import { InputPermissionCategory, system as system2 } from "@minecraft/server";
function disableMovement(player) {
  try {
    player.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, false);
  } catch {
    try {
      player.addEffect("slowness", 3, { amplifier: 255, showParticles: false });
    } catch {
    }
  }
}
function enableMovement(player) {
  try {
    player.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, true);
  } catch {
  }
}
var activeInputLocks = /* @__PURE__ */ new Map();
function releaseExpiredInputLocks() {
  const tick = system2.currentTick;
  for (const player of world.getPlayers()) {
    const until = activeInputLocks.get(player.id);
    if (until === void 0 || tick < until) continue;
    activeInputLocks.delete(player.id);
    enableMovement(player);
  }
}
function lockInputAndSuppressVanilla(player, durationTicks, state) {
  const until = system2.currentTick + Math.max(1, durationTicks);
  activeInputLocks.set(player.id, Math.max(activeInputLocks.get(player.id) ?? 0, until));
  state.inputLockUntilTick = Math.max(state.inputLockUntilTick ?? 0, until);
  try {
    disableMovement(player);
    state.inputLocked = true;
  } catch {
    state.inputLocked = false;
  }
}
function maintainOrReleaseInputLock(player, state) {
  const tick = system2.currentTick;
  if (state.inputLockUntilTick && tick < state.inputLockUntilTick) {
    if (state.inputLocked)
      try {
        disableMovement(player);
      } catch {
      }
    return;
  }
  if (state.inputLocked)
    try {
      enableMovement(player);
    } catch {
    }
  state.inputLocked = false;
  state.inputLockUntilTick = 0;
}

// scripts/systems/targeting.ts
var NON_TARGET_TYPES = ["minecraft:item", "minecraft:xp_orb", "minecraft:arrow", "minecraft:armor_stand", "minecraft:painting", "minecraft:leash_knot"];
function safeHit(fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch {
    }
  };
}
function getTargetsInCone(player, range, coneDeg, maxTargets) {
  const dim = player.dimension;
  if (!dim?.getEntities) return [];
  const origin = player.location;
  const view = player.getViewDirection();
  const flatLen = Math.sqrt(view.x * view.x + view.z * view.z);
  const forward = flatLen > 1e-3 ? { x: view.x / flatLen, z: view.z / flatLen } : { x: 0, z: 1 };
  const cosThreshold = Math.cos(coneDeg * Math.PI / 180 / 2);
  const list = dim.getEntities({ location: origin, maxDistance: range + 1, excludeTypes: NON_TARGET_TYPES }) || [];
  const results = [];
  for (const e of list) {
    try {
      if (!e || !e.isValid || e.id === player.id || !e.location) continue;
      const health = e.getComponent("minecraft:health");
      if (!health || health.currentValue <= 0) continue;
      if (e.getComponent("minecraft:tameable")?.tamedToPlayerId === player.id) continue;
      if (Math.abs(e.location.y - origin.y) > 2.5) continue;
    } catch {
      continue;
    }
    const dx = e.location.x - origin.x;
    const dz = e.location.z - origin.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= 0.01 || dist > range) continue;
    const dot = forward.x * (dx / dist) + forward.z * (dz / dist);
    if (dot >= cosThreshold) {
      results.push(e);
      if (results.length >= maxTargets) break;
    }
  }
  try {
    drawAttackCone(player, range, coneDeg, results);
  } catch {
  }
  return results;
}

// scripts/systems/combo.ts
import { system as system3 } from "@minecraft/server";
var ATTACKING_FLAG = "attacking";
var ATTACK_BLEND_OUT_SECONDS = 0.3;
var MOVEMENT_LOCK_AFTER_HIT_TICKS = 3;
function resetAttackingFlagIfNeeded(player, state) {
  if (state.attackingFlagUntil > 0 && system3.currentTick >= state.attackingFlagUntil) {
    player.setDynamicProperty(ATTACKING_FLAG, 0);
    state.attackingFlagUntil = 0;
  }
}
function startAttack(player, state, cfg, setState9) {
  const tick = system3.currentTick;
  if (!state.isAttacking && tick - state.lastAttackTick > cfg.comboResetTicks) state.comboIndex = 0;
  const anim = cfg.anims[state.comboIndex % cfg.anims.length];
  state.isAttacking = true;
  state.frame = 0;
  state.bufferedNext = false;
  state.lastAttackTick = tick;
  state.lockUntilTick = tick + anim.nextAttackWindow;
  player.setDynamicProperty(ATTACKING_FLAG, 1);
  state.attackingFlagUntil = tick + cfg.attackLockTicks;
  // Solo se bloquea el movimiento durante el tramo del golpe (hasta justo
  // despues del ultimo hit frame), no durante toda la animacion: asi el
  // ataque no "congela" al jugador tanto tiempo.
  const lastHit = anim.hitFrames.length ? anim.hitFrames[anim.hitFrames.length - 1] : anim.attackTime;
  const lockTicks = anim.movementLockTicks ?? Math.min(anim.attackTime, lastHit + MOVEMENT_LOCK_AFTER_HIT_TICKS);
  lockInputAndSuppressVanilla(player, lockTicks, state);
  playAttackAnimations(player, anim, cfg);
  setState9(player, state);
}
// Tercera y primera persona usan animaciones distintas: la de combo (cuerpo
// entero) se corta en la vista de primera persona y la "fp_" (solo el brazo,
// pensada para la camara) se corta en tercera. Cada cliente ve solo la suya.
var FIRST_PERSON_STOP = "variable.is_first_person";
var THIRD_PERSON_STOP = "!variable.is_first_person";
var firstPersonName = (animation) => animation.replace(/\.([^.]+)$/, ".fp_$1");
function playAttackAnimations(player, anim, cfg) {
  const blendOutTime = cfg.blendOutSeconds ?? ATTACK_BLEND_OUT_SECONDS;
  player.playAnimation(anim.animation, { controller: cfg.animController, blendOutTime, stopExpression: FIRST_PERSON_STOP });
  try {
    player.playAnimation(firstPersonName(anim.animation), { controller: cfg.animController + ".fp", blendOutTime: 0.15, stopExpression: THIRD_PERSON_STOP });
  } catch {
  }
}
// Pulsar atacar durante un ataque solo deja el siguiente golpe "en cola": no
// reinicia nada. Ademas mantiene al jugador plantado hasta que el golpe en
// cola empieza, para que no se deslice entre un golpe y otro.
function bufferNextAttack(player, state, setState9, cfg) {
  state.bufferedNext = true;
  const anim = cfg?.anims?.[state.comboIndex % cfg.anims.length];
  if (anim) lockInputAndSuppressVanilla(player, Math.max(1, anim.cancelIntoNextTick - state.frame + 2), state);
  setState9(player, state);
}
// Paso de ataque: antes cada frame de golpe empujaba al jugador hacia delante
// con fuerza 1 (y dos veces en armas con dos hit frames), lo que lo arrastraba
// por el suelo. Ahora solo se aplica en el primer hit frame y con la fuerza de
// ATTACK_STEP_STRENGTH (0 = el jugador se queda clavado en el sitio).
var ATTACK_STEP_STRENGTH = 0;
function attackStep(player, dir, anim, state) {
  if (state.frame !== anim.hitFrames[0]) return;
  try {
    player.applyKnockback({ x: dir.x * ATTACK_STEP_STRENGTH, z: dir.z * ATTACK_STEP_STRENGTH }, 0);
  } catch {
  }
}
var RESET_ANIMATION = "animation.resonance.reset";
function endAttackAnimation(player, cfg) {
  for (const controller of [cfg.animController, cfg.animController + ".fp"]) {
    try {
      player.playAnimation(RESET_ANIMATION, { controller, blendOutTime: 0 });
    } catch {
    }
  }
}
function handleComboTransitionOrEnd(player, state, cfg, setState9) {
  const tick = system3.currentTick;
  const anim = cfg.anims[state.comboIndex % cfg.anims.length];
  if (state.bufferedNext && tick >= state.lockUntilTick && state.frame >= anim.cancelIntoNextTick) {
    state.bufferedNext = false;
    state.comboIndex = (state.comboIndex + 1) % cfg.anims.length;
    setState9(player, state);
    startAttack(player, state, cfg, setState9);
    return "cancel";
  }
  if (state.frame >= anim.attackTime) {
    endAttackAnimation(player, cfg);
    state.isAttacking = false;
    state.frame = 0;
    state.bufferedNext = false;
    setState9(player, state);
    return "end";
  }
  setState9(player, state);
  return "continue";
}

// scripts/armory/coal/smoke_club.ts
var WEAPON_ID = "resonance:smoke_club";
var BASE_DAMAGE = 8;
var INPUT_COOLDOWN_TICKS = 2;
var COMBO_RESET_TICKS = 40;
var ATTACK_LOCK_TICKS = 2;
var ANIM_CONTROLLER = "controller.animation.smoke_club";
var SPECIAL_COOLDOWN_TICKS = 40;
var SMOKE_PARTICLE_COUNT = 6;
var SMOKE_RADIUS = 1.5;
var SMOKE_EFFECTS = [
  { type: "blindness", duration: 38, level: 1 },
  { type: "slowness", duration: 40, level: 1 }
];
var ANIMS = [
  {
    animation: "animation.smoke_club.attack",
    attackTime: 25,
    nextAttackWindow: 5,
    cancelIntoNextTick: 14,
    hitFrames: [9, 10],
    range: 2.8,
    coneDeg: 75,
    damageMultiplier: 1,
    specialFrame: 9
  },
  {
    animation: "animation.smoke_club.attack1",
    attackTime: 25,
    nextAttackWindow: 5,
    cancelIntoNextTick: 14,
    hitFrames: [9, 10],
    range: 3.2,
    coneDeg: 80,
    damageMultiplier: 1.15,
    specialFrame: 9
  },
  {
    animation: "animation.smoke_club.attack2",
    attackTime: 25,
    nextAttackWindow: 8,
    cancelIntoNextTick: 25,
    hitFrames: [9, 10],
    range: 3,
    coneDeg: 85,
    damageMultiplier: 1.35,
    specialFrame: 9
  }
];
var COMBO_CFG = {
  anims: ANIMS,
  animController: ANIM_CONTROLLER,
  inputCooldownTicks: INPUT_COOLDOWN_TICKS,
  attackLockTicks: ATTACK_LOCK_TICKS,
  comboResetTicks: COMBO_RESET_TICKS
};
var STATE_KEY = "res_smoke_club_state";
var DEFAULT_STATE = {
  comboIndex: 0,
  isAttacking: false,
  frame: 0,
  bufferedNext: false,
  lockUntilTick: 0,
  lastAttackTick: 0,
  attackingFlagUntil: 0,
  inputLockUntilTick: 0,
  inputLocked: false,
  specialTriggeredThisSwing: false
};
var getState = (p) => {
  const r = p.getDynamicProperty(STATE_KEY);
  return r ? JSON.parse(r) : { ...DEFAULT_STATE };
};
var setState = (p, s) => p.setDynamicProperty(STATE_KEY, JSON.stringify(s));
function isHoldingWeapon(player) {
  const eq = player.getComponent(EntityComponentTypes.Equippable);
  if (!eq) return false;
  try {
    return eq.getEquipment(EquipmentSlot.Mainhand)?.typeId === WEAPON_ID;
  } catch {
  }
  return player.getComponent("minecraft:equippable")?.getEquipment?.("Mainhand")?.typeId === WEAPON_ID;
}
var calcDamage = (anim) => Math.floor(BASE_DAMAGE * anim.damageMultiplier);
var applyHit = safeHit((player, target, dmg) => dealDamage(target, dmg, { cause: EntityDamageCause.entityAttack, damagingEntity: player }));
function triggerSmokeSpecial(attacker, primaryTarget) {
  withCooldown(attacker, "smoke_club_special", SPECIAL_COOLDOWN_TICKS, () => {
    spawnSmoke(primaryTarget.dimension, primaryTarget.location, SMOKE_PARTICLE_COUNT);
    applyAreaEffect(primaryTarget.dimension, primaryTarget.location, SMOKE_RADIUS, [...SMOKE_EFFECTS], attacker);
    drawAreaRadius(attacker, primaryTarget.location, SMOKE_RADIUS);
  });
}
function tickWeapon(player) {
  if (!isHoldingWeapon(player)) return;
  const state = getState(player);
  resetAttackingFlagIfNeeded(player, state);
  maintainOrReleaseInputLock(player, state);
  if (!state.isAttacking) {
    setState(player, state);
    return;
  }
  const anim = ANIMS[state.comboIndex % ANIMS.length];
  state.frame++;
  if (state.frame === 1) {
    state.specialTriggeredThisSwing = false;
  }
  if (anim.hitFrames.includes(state.frame)) {
    const targets = getTargetsInCone(player, anim.range, anim.coneDeg, 10);
    const dir = player.getViewDirection();
    attackStep(player, dir, anim, state);
    if (targets.length > 0) {
      const dmg = calcDamage(anim);
      for (const t of targets) applyHit(player, t, dmg);
      const specialFrame = anim.specialFrame ?? anim.hitFrames[0];
      if (!state.specialTriggeredThisSwing && state.frame === specialFrame) {
        state.specialTriggeredThisSwing = true;
        triggerSmokeSpecial(player, targets[0]);
      }
      try {
        world.getDimension(player.dimension.id).playSound("random.fuse", targets[0].location, { volume: 0.4, pitch: 1.2 });
        player.runCommand("execute as @s run camerashake add @s 0.3 0.3");
      } catch {
      }
    }
  }
  handleComboTransitionOrEnd(player, state, COMBO_CFG, setState);
}
onWeaponHit((ev) => {
  const { damagingEntity: attacker, hitEntity: victim } = ev;
  if (!attacker || attacker.typeId !== "minecraft:player" || !victim) return;
  if (!isHoldingWeapon(attacker)) return;
  withCooldown(attacker, "smoke_club_input", INPUT_COOLDOWN_TICKS, () => {
    const s = getState(attacker);
    resetAttackingFlagIfNeeded(attacker, s);
    if (s.isAttacking) {
      bufferNextAttack(attacker, s, setState, COMBO_CFG);
      return;
    }
    startAttack(attacker, s, COMBO_CFG, setState);
  });
});
system4.runInterval(() => world.getPlayers().forEach(safeTick(tickWeapon)), 1);

// scripts/armory/iron/iron_halberd.ts
import { world as world2, system as system5, EntityDamageCause as EntityDamageCause2, EntityComponentTypes as EntityComponentTypes2, EquipmentSlot as EquipmentSlot2 } from "@minecraft/server";
var WEAPON_ID2 = "resonance:iron_halberd";
var BASE_DAMAGE2 = 12;
var INPUT_COOLDOWN_TICKS2 = 2;
var COMBO_RESET_TICKS2 = 40;
var ATTACK_LOCK_TICKS2 = 2;
var ANIM_CONTROLLER2 = "res:halberd_combo";
var ARMOR_BONUS_MULTIPLIER = 0.35;
var ARMOR_BONUS_PER_ARMOR_POINT = 0.4;
var KNOCKBACK_STRENGTH = 1.4;
var KNOCKBACK_VERTICAL = 0.35;
var ANIMS2 = [
  {
    animation: "animation.iron_halberd.attack",
    attackTime: 25,
    nextAttackWindow: 5,
    cancelIntoNextTick: 17,
    hitFrames: [5, 6],
    range: 3.7,
    coneDeg: 75,
    damageMultiplier: 1
  },
  {
    animation: "animation.iron_halberd.attack1",
    attackTime: 24,
    nextAttackWindow: 5,
    cancelIntoNextTick: 12,
    hitFrames: [5],
    range: 3.3,
    coneDeg: 80,
    damageMultiplier: 1.15
  },
  {
    animation: "animation.iron_halberd.attack2",
    attackTime: 25,
    nextAttackWindow: 8,
    cancelIntoNextTick: 25,
    hitFrames: [5, 6],
    range: 3.5,
    coneDeg: 85,
    damageMultiplier: 1.35
  }
];
var COMBO_CFG2 = {
  anims: ANIMS2,
  animController: ANIM_CONTROLLER2,
  inputCooldownTicks: INPUT_COOLDOWN_TICKS2,
  attackLockTicks: ATTACK_LOCK_TICKS2,
  comboResetTicks: COMBO_RESET_TICKS2
};
var STATE_KEY2 = "res_halberd_state";
var DEFAULT_STATE2 = {
  comboIndex: 0,
  isAttacking: false,
  frame: 0,
  bufferedNext: false,
  lockUntilTick: 0,
  lastAttackTick: 0,
  attackingFlagUntil: 0,
  inputLockUntilTick: 0,
  inputLocked: false
};
var getState2 = (p) => {
  const r = p.getDynamicProperty(STATE_KEY2);
  return r ? JSON.parse(r) : { ...DEFAULT_STATE2 };
};
var setState2 = (p, s) => p.setDynamicProperty(STATE_KEY2, JSON.stringify(s));
function isHoldingWeapon2(player) {
  const eq = player.getComponent("minecraft:equippable");
  return !!eq && eq.getEquipment?.("Mainhand")?.typeId === WEAPON_ID2;
}
function getArmorValue(target) {
  try {
    const attr = target.getComponent?.("minecraft:attribute");
    const armorAttr = attr?.getAttribute?.("minecraft:armor") ?? attr?.getAttribute?.("minecraft:armor_value") ?? null;
    if (armorAttr?.currentValue !== void 0) return Number(armorAttr.currentValue) || 0;
  } catch {
  }
  const eq = target.getComponent(EntityComponentTypes2.Equippable);
  if (!eq) return 0;
  let pieces = 0;
  for (const slot of [EquipmentSlot2.Head, EquipmentSlot2.Chest, EquipmentSlot2.Legs, EquipmentSlot2.Feet]) {
    try {
      if (eq.getEquipment(slot)) pieces++;
    } catch {
    }
  }
  return pieces * 2;
}
function calcDamage2(target, anim) {
  const armor = getArmorValue(target);
  let dmg = BASE_DAMAGE2 * anim.damageMultiplier;
  if (armor > 0) {
    dmg *= 1 + ARMOR_BONUS_MULTIPLIER;
    dmg += armor * ARMOR_BONUS_PER_ARMOR_POINT;
  }
  return Math.floor(dmg);
}
var applyHit2 = safeHit(function applyHit2(player, target, dmg) {
  dealDamage(target, dmg, { cause: EntityDamageCause2.entityAttack, damagingEntity: player });
  const dir = player.getViewDirection();
  target.applyKnockback({ x: dir.x * KNOCKBACK_STRENGTH, z: dir.z * KNOCKBACK_STRENGTH }, KNOCKBACK_VERTICAL);
});
function tickWeapon2(player) {
  if (!isHoldingWeapon2(player)) return;
  const state = getState2(player);
  resetAttackingFlagIfNeeded(player, state);
  maintainOrReleaseInputLock(player, state);
  if (!state.isAttacking) {
    setState2(player, state);
    return;
  }
  const anim = ANIMS2[state.comboIndex % ANIMS2.length];
  state.frame++;
  if (anim.hitFrames.includes(state.frame)) {
    const targets = getTargetsInCone(player, anim.range, anim.coneDeg, 10);
    let hitSomething = false;
    for (const t of targets) {
      applyHit2(player, t, calcDamage2(t, anim));
      hitSomething = true;
    }
    const dir = player.getViewDirection();
    attackStep(player, dir, anim, state);
    try {
      world2.getDimension(player.dimension.id).playSound("random.anvil_land", player.location, { volume: 0.5, pitch: 1.5 });
      if (hitSomething) player.runCommand("execute as @s run camerashake add @s 0.3 0.3");
    } catch {
    }
  }
  handleComboTransitionOrEnd(player, state, COMBO_CFG2, setState2);
}
onWeaponHit((ev) => {
  const { damagingEntity: attacker, hitEntity: victim } = ev;
  if (!attacker || attacker.typeId !== "minecraft:player" || !victim) return;
  if (!isHoldingWeapon2(attacker)) return;
  withCooldown(attacker, "iron_halberd_input", INPUT_COOLDOWN_TICKS2, () => {
    const s = getState2(attacker);
    resetAttackingFlagIfNeeded(attacker, s);
    if (s.isAttacking) {
      bufferNextAttack(attacker, s, setState2, COMBO_CFG2);
      return;
    }
    startAttack(attacker, s, COMBO_CFG2, setState2);
  });
});
system5.runInterval(() => world2.getPlayers().forEach(safeTick(tickWeapon2)), 1);

// scripts/armory/gold/golden_rapier.ts
import { world as world3, system as system6, EntityDamageCause as EntityDamageCause3, EntityComponentTypes as EntityComponentTypes3, EquipmentSlot as EquipmentSlot3, GameMode } from "@minecraft/server";
var WEAPON_ID3 = "resonance:golden_rapier";
var BASE_DAMAGE3 = 4;
var INPUT_COOLDOWN_TICKS3 = 2;
var COMBO_RESET_TICKS3 = 40;
var ATTACK_LOCK_TICKS3 = 2;
var ANIM_CONTROLLER3 = "res:rapier_combo";
var CRIT_CHANCE = 0.4;
var CRIT_BONUS_DAMAGE = 6;
var CRIT_COOLDOWN_TICKS = 2;
var EXTRA_DURABILITY_ON_CRIT = 1;
var ANIMS3 = [
  {
    animation: "animation.golden_rapier.attack",
    attackTime: 16,
    nextAttackWindow: 2,
    cancelIntoNextTick: 8,
    hitFrames: [4],
    range: 5.5,
    coneDeg: 70,
    damageMultiplier: 1
  },
  {
    animation: "animation.golden_rapier.attack1",
    attackTime: 20,
    nextAttackWindow: 2,
    cancelIntoNextTick: 10,
    hitFrames: [2, 3],
    range: 5.5,
    coneDeg: 75,
    damageMultiplier: 1.1
  },
  {
    animation: "animation.golden_rapier.attack2",
    attackTime: 15,
    nextAttackWindow: 3,
    cancelIntoNextTick: 15,
    hitFrames: [1, 2],
    range: 5.5,
    coneDeg: 80,
    damageMultiplier: 1.25
  }
];
var COMBO_CFG3 = {
  anims: ANIMS3,
  animController: ANIM_CONTROLLER3,
  inputCooldownTicks: INPUT_COOLDOWN_TICKS3,
  attackLockTicks: ATTACK_LOCK_TICKS3,
  comboResetTicks: COMBO_RESET_TICKS3
};
var STATE_KEY3 = "res_rapier_state";
var DEFAULT_STATE3 = {
  comboIndex: 0,
  isAttacking: false,
  frame: 0,
  bufferedNext: false,
  lockUntilTick: 0,
  lastAttackTick: 0,
  attackingFlagUntil: 0,
  inputLockUntilTick: 0,
  inputLocked: false,
  critProcLockedUntilTick: 0
};
var getState3 = (p) => {
  const r = p.getDynamicProperty(STATE_KEY3);
  return r ? JSON.parse(r) : { ...DEFAULT_STATE3 };
};
var setState3 = (p, s) => p.setDynamicProperty(STATE_KEY3, JSON.stringify(s));
function getMainhand(player) {
  try {
    return player.getComponent(EntityComponentTypes3.Equippable)?.getEquipment(EquipmentSlot3.Mainhand) ?? null;
  } catch {
  }
  try {
    return player.getComponent("minecraft:equippable")?.getEquipment?.("Mainhand") ?? null;
  } catch {
    return null;
  }
}
var isHoldingWeapon3 = (player) => getMainhand(player)?.typeId === WEAPON_ID3;
function damageDurabilityOnCrit(player, amount) {
  if (amount <= 0) return;
  try {
    if (player.getGameMode?.() === GameMode.Creative) return;
  } catch {
  }
  const mh = getMainhand(player);
  if (!mh) return;
  try {
    const durability = mh.getComponent("minecraft:durability");
    if (!durability) return;
    const eq = player.getComponent?.(EntityComponentTypes3.Equippable) ?? player.getComponent?.("minecraft:equippable");
    if (durability.damage + amount >= durability.maxDurability) {
      eq?.setEquipment(EquipmentSlot3.Mainhand, void 0);
      try {
        player.dimension.playSound("random.break", player.location);
      } catch {
      }
      return;
    }
    durability.damage += amount;
    try {
      eq?.setEquipment(EquipmentSlot3.Mainhand, mh);
    } catch {
      try {
        eq?.setEquipment("Mainhand", mh);
      } catch {
      }
    }
  } catch {
  }
}
var calcBaseDamage = (anim) => Math.floor(BASE_DAMAGE3 * anim.damageMultiplier);
var rollCrit = () => Math.random() < CRIT_CHANCE;
var applyHit3 = safeHit((player, target, dmg) => dealDamage(target, dmg, { cause: EntityDamageCause3.entityAttack, damagingEntity: player }));
function tickWeapon3(player) {
  if (!isHoldingWeapon3(player)) return;
  const state = getState3(player);
  resetAttackingFlagIfNeeded(player, state);
  maintainOrReleaseInputLock(player, state);
  if (!state.isAttacking) {
    setState3(player, state);
    return;
  }
  const anim = ANIMS3[state.comboIndex % ANIMS3.length];
  state.frame++;
  if (anim.hitFrames.includes(state.frame)) {
    const targets = getTargetsInCone(player, anim.range, anim.coneDeg, 10);
    if (targets.length > 0) {
      const baseDmg = calcBaseDamage(anim);
      const tick = system6.currentTick;
      const canCrit = tick >= (state.critProcLockedUntilTick ?? 0);
      const didCrit = canCrit && rollCrit();
      if (didCrit) state.critProcLockedUntilTick = tick + CRIT_COOLDOWN_TICKS;
      for (const t of targets) {
        applyHit3(player, t, baseDmg);
        if (didCrit)
          dealDamage(t, CRIT_BONUS_DAMAGE, { cause: EntityDamageCause3.entityAttack, damagingEntity: player });
      }
      if (didCrit) {
        damageDurabilityOnCrit(player, EXTRA_DURABILITY_ON_CRIT);
        try {
          world3.getDimension(player.dimension.id).playSound("random.levelup", player.location, { volume: 0.35, pitch: 1.8 });
        } catch {
        }
      }
    }
  }
  handleComboTransitionOrEnd(player, state, COMBO_CFG3, setState3);
}
onWeaponHit((ev) => {
  const { damagingEntity: attacker, hitEntity: victim } = ev;
  if (!attacker || attacker.typeId !== "minecraft:player" || !victim) return;
  if (!isHoldingWeapon3(attacker)) return;
  withCooldown(attacker, "golden_rapier_input", INPUT_COOLDOWN_TICKS3, () => {
    const s = getState3(attacker);
    resetAttackingFlagIfNeeded(attacker, s);
    if (s.isAttacking) {
      bufferNextAttack(attacker, s, setState3, COMBO_CFG3);
      return;
    }
    startAttack(attacker, s, COMBO_CFG3, setState3);
  });
});
system6.runInterval(() => world3.getPlayers().forEach(safeTick(tickWeapon3)), 1);

// scripts/armory/copper/copper_hammer.ts
import { world as world4, system as system7, EntityDamageCause as EntityDamageCause4 } from "@minecraft/server";
var WEAPON_ID4 = "resonance:copper_hammer";
var BASE_DAMAGE4 = 12;
var INPUT_COOLDOWN_TICKS4 = 2;
var COMBO_RESET_TICKS4 = 40;
var ATTACK_LOCK_TICKS4 = 2;
var ANIM_CONTROLLER4 = "res:hammer_combo";
var SHOCK_THRESHOLD = 3;
var SHOCK_MAX_STREAK = 5;
var SHOCK_COOLDOWN_TICKS = 8;
var SHOCK_DAMAGE_BASE = 2;
var SHOCK_DAMAGE_WET = 3;
var SHOCK_RADIUS_BASE = 3;
var SHOCK_RADIUS_WET = 4;
var ANIMS4 = [
  {
    animation: "animation.copper_hammer.attack",
    attackTime: 29,
    nextAttackWindow: 8,
    cancelIntoNextTick: 20,
    hitFrames: [13],
    range: 3,
    coneDeg: 75,
    damageMultiplier: 1
  },
  {
    animation: "animation.copper_hammer.attack1",
    attackTime: 29,
    nextAttackWindow: 8,
    cancelIntoNextTick: 17,
    hitFrames: [12, 13],
    range: 3,
    coneDeg: 80,
    damageMultiplier: 1.15
  },
  {
    animation: "animation.copper_hammer.attack2",
    attackTime: 29,
    nextAttackWindow: 8,
    cancelIntoNextTick: 29,
    hitFrames: [13, 14],
    range: 3.5,
    coneDeg: 85,
    damageMultiplier: 2
  }
];
var COMBO_CFG4 = {
  anims: ANIMS4,
  animController: ANIM_CONTROLLER4,
  inputCooldownTicks: INPUT_COOLDOWN_TICKS4,
  attackLockTicks: ATTACK_LOCK_TICKS4,
  comboResetTicks: COMBO_RESET_TICKS4
};
var STATE_KEY4 = "res_hammer_state";
var DEFAULT_STATE4 = {
  comboIndex: 0,
  isAttacking: false,
  frame: 0,
  bufferedNext: false,
  lockUntilTick: 0,
  lastAttackTick: 0,
  attackingFlagUntil: 0,
  inputLockUntilTick: 0,
  inputLocked: false,
  hitStreak: 0,
  lastHitTick: 0
};
var getState4 = (p) => {
  const r = p.getDynamicProperty(STATE_KEY4);
  return r ? JSON.parse(r) : { ...DEFAULT_STATE4 };
};
var setState4 = (p, s) => p.setDynamicProperty(STATE_KEY4, JSON.stringify(s));
function isHoldingWeapon4(player) {
  const eq = player.getComponent("minecraft:equippable");
  return !!eq && eq.getEquipment?.("Mainhand")?.typeId === WEAPON_ID4;
}
var calcDamage3 = (anim) => Math.floor(BASE_DAMAGE4 * anim.damageMultiplier);
var applyHit4 = safeHit((player, target, dmg) => {
  dealDamage(target, dmg, { cause: EntityDamageCause4.entityAttack, damagingEntity: player });
  const dir = player.getViewDirection();
  target.applyKnockback({ x: dir.x * 0.2, z: dir.z * 0.2 }, 0.02);
});
function isWet(entity) {
  try {
    if (entity.isInWater) return true;
    if (entity.isInRain) return true;
  } catch {
  }
  try {
    const { x, y, z } = entity.location;
    const block = entity.dimension.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
    if (block?.typeId === "minecraft:water" || block?.typeId === "minecraft:flowing_water") return true;
  } catch {
  }
  return false;
}
function tryShock(player, primaryTarget, state) {
  const tick = system7.currentTick;
  if (!state.lastHitTick || tick - state.lastHitTick > COMBO_RESET_TICKS4) state.hitStreak = 0;
  state.hitStreak = Math.min((state.hitStreak ?? 0) + 1, SHOCK_MAX_STREAK);
  state.lastHitTick = tick;
  if (state.hitStreak < SHOCK_THRESHOLD) return;
  if (isOnCooldown(player, "copper_hammer_shock")) return;
  withCooldown(player, "copper_hammer_shock", SHOCK_COOLDOWN_TICKS, () => {
  });
  const wet = isWet(player) || isWet(primaryTarget);
  const shockDamage = wet ? SHOCK_DAMAGE_WET : SHOCK_DAMAGE_BASE;
  const radius = wet ? SHOCK_RADIUS_WET : SHOCK_RADIUS_BASE;
  drawAreaRadius(player, primaryTarget.location, radius);
  const nearby = primaryTarget.dimension.getEntities({ location: primaryTarget.location, maxDistance: radius }) || [];
  for (const e of nearby) {
    if (!e || e.id === player.id || e.id === primaryTarget.id) continue;
    if (!e.getComponent?.("minecraft:health")) continue;
    if (e.getComponent("minecraft:tameable")?.tamedToPlayerId === player.id) continue;
    try {
      dealDamage(e, shockDamage, { cause: EntityDamageCause4.magic, damagingEntity: player });
    } catch {
    }
  }
  try {
    world4.getDimension(player.dimension.id).playSound("random.orb", primaryTarget.location, {
      volume: 0.6,
      pitch: wet ? 1.4 : 1.2
    });
  } catch {
  }
}
function tickWeapon4(player) {
  if (!isHoldingWeapon4(player)) return;
  const state = getState4(player);
  resetAttackingFlagIfNeeded(player, state);
  maintainOrReleaseInputLock(player, state);
  if (!state.isAttacking) {
    setState4(player, state);
    return;
  }
  const anim = ANIMS4[state.comboIndex % ANIMS4.length];
  state.frame++;
  if (anim.hitFrames.includes(state.frame)) {
    const targets = getTargetsInCone(player, anim.range, anim.coneDeg, 10);
    const dir = player.getViewDirection();
    attackStep(player, dir, anim, state);
    if (targets.length > 0) {
      const dmg = calcDamage3(anim);
      for (const t of targets) applyHit4(player, t, dmg);
      tryShock(player, targets[0], state);
      try {
        world4.getDimension(player.dimension.id).playSound("random.anvil_use", player.location, { volume: 0.35, pitch: 1.6 });
        player.runCommand("execute as @s run camerashake add @s 0.3 0.3");
      } catch {
      }
    }
  }
  handleComboTransitionOrEnd(player, state, COMBO_CFG4, setState4);
}
onWeaponHit((ev) => {
  const { damagingEntity: attacker, hitEntity: victim } = ev;
  if (!attacker || attacker.typeId !== "minecraft:player" || !victim) return;
  if (!isHoldingWeapon4(attacker)) return;
  withCooldown(attacker, "copper_hammer_input", INPUT_COOLDOWN_TICKS4, () => {
    const s = getState4(attacker);
    resetAttackingFlagIfNeeded(attacker, s);
    if (s.isAttacking) {
      bufferNextAttack(attacker, s, setState4, COMBO_CFG4);
      return;
    }
    startAttack(attacker, s, COMBO_CFG4, setState4);
  });
});
system7.runInterval(() => world4.getPlayers().forEach(safeTick(tickWeapon4)), 1);

// scripts/armory/diamond/diamond_greatsword.ts
import { world as world5, system as system8, EntityDamageCause as EntityDamageCause5 } from "@minecraft/server";

// scripts/utils/armor.ts
import { EntityComponentTypes as EntityComponentTypes4 } from "@minecraft/server";
function getArmorValue2(target) {
  try {
    if (target.typeId === "minecraft:player") {
      const eq = target.getComponent(EntityComponentTypes4.Equippable);
      const totalArmor = eq?.totalArmor;
      if (typeof totalArmor === "number") {
        return totalArmor;
      }
    }
    const prop = target.getDynamicProperty?.("armor_value");
    if (typeof prop === "number") {
      return prop;
    }
    return 0;
  } catch (error) {
    return 0;
  }
}
function getArmorDamageReduction(target) {
  const armorValue = getArmorValue2(target);
  const reduction = Math.min(armorValue, 20) / 25;
  return reduction;
}

// scripts/armory/diamond/diamond_greatsword.ts
var WEAPON_ID5 = "resonance:diamond_greatsword";
var BASE_DAMAGE5 = 14;
var INPUT_COOLDOWN_TICKS5 = 2;
var COMBO_RESET_TICKS5 = 40;
var ATTACK_LOCK_TICKS5 = 2;
var ANIM_CONTROLLER5 = "res:greatsword_combo";
var FRACTURE_MAX_STACKS = 4;
var FRACTURE_ARMOR_REDUCTION = 0.1;
var FRACTURE_EXPIRE_TICKS = 100;
var SHATTER_BONUS_DAMAGE = 16;
var SHATTER_WEAKNESS_SECONDS = 3;
var SHATTER_WEAKNESS_TICKS = SHATTER_WEAKNESS_SECONDS * 20;
var SHATTER_COOLDOWN_TICKS = 60;
var KNOCKBACK_STRENGTH2 = 1.2;
var KNOCKBACK_VERTICAL2 = 0.3;
var ANIMS5 = [
  {
    animation: "animation.diamond_greatsword.attack",
    attackTime: 30,
    nextAttackWindow: 6,
    cancelIntoNextTick: 27,
    hitFrames: [17, 18],
    range: 4.5,
    coneDeg: 80,
    damageMultiplier: 1
  },
  {
    animation: "animation.diamond_greatsword.attack1",
    attackTime: 32,
    nextAttackWindow: 6,
    cancelIntoNextTick: 27,
    hitFrames: [17, 18],
    range: 5,
    coneDeg: 85,
    damageMultiplier: 1.2
  },
  {
    animation: "animation.diamond_greatsword.attack2",
    attackTime: 41,
    nextAttackWindow: 8,
    cancelIntoNextTick: 41,
    hitFrames: [21, 22],
    // finisher — paling lambat, paling sakit
    range: 5.3,
    coneDeg: 180,
    damageMultiplier: 1.5
  }
];
var CONFIG = {
  blendOutSeconds: 0.25,
  anims: ANIMS5,
  animController: ANIM_CONTROLLER5,
  inputCooldownTicks: INPUT_COOLDOWN_TICKS5,
  attackLockTicks: ATTACK_LOCK_TICKS5,
  comboResetTicks: COMBO_RESET_TICKS5
};
var STATE_KEY5 = "res_greatsword_state";
var DEFAULT_STATE5 = {
  comboIndex: 0,
  isAttacking: false,
  frame: 0,
  bufferedNext: false,
  lockUntilTick: 0,
  lastAttackTick: 0,
  attackingFlagUntil: 0,
  inputLockUntilTick: 0,
  inputLocked: false,
  fractureAppliedThisSwing: false
};
var getState5 = (p) => {
  const r = p.getDynamicProperty(STATE_KEY5);
  return r ? JSON.parse(r) : { ...DEFAULT_STATE5 };
};
var setState5 = (p, s) => p.setDynamicProperty(STATE_KEY5, JSON.stringify(s));
function isHoldingWeapon5(player) {
  const eq = player.getComponent("minecraft:equippable");
  return !!eq && eq.getEquipment?.("Mainhand")?.typeId === WEAPON_ID5;
}
var fractureMap = /* @__PURE__ */ new Map();
function getTargetKey(target) {
  return target.id;
}
function getFractureStacks(target) {
  const key = getTargetKey(target);
  const data = fractureMap.get(key);
  if (!data) {
    return 0;
  }
  if (system8.currentTick - data.lastTick > FRACTURE_EXPIRE_TICKS) {
    fractureMap.delete(key);
    return 0;
  }
  return data.stacks;
}
function addFractureStack(target) {
  const key = getTargetKey(target);
  const current = getFractureStacks(target);
  const next = Math.min(current + 1, FRACTURE_MAX_STACKS);
  fractureMap.set(key, {
    stacks: next,
    lastTick: system8.currentTick
  });
  return next;
}
function clearFractureStacks(target) {
  fractureMap.delete(getTargetKey(target));
}
function calcDamage4(anim, target, stackCount) {
  const base = BASE_DAMAGE5 * anim.damageMultiplier;
  const armorReduction = getArmorDamageReduction(target);
  const fractureBypass = stackCount * FRACTURE_ARMOR_REDUCTION;
  const effectiveReduction = armorReduction * Math.max(0, 1 - fractureBypass);
  return Math.floor(base * (1 - effectiveReduction));
}
var applyHit5 = safeHit(function applyHit5(player, target, dmg) {
  dealDamage(target, dmg, { cause: EntityDamageCause5.entityAttack, damagingEntity: player });
  const dir = player.getViewDirection();
  target.applyKnockback({ x: dir.x * KNOCKBACK_STRENGTH2, z: dir.z * KNOCKBACK_STRENGTH2 }, KNOCKBACK_VERTICAL2);
});
function triggerShatter(player, target) {
  withCooldown(player, "greatsword_shatter", SHATTER_COOLDOWN_TICKS, () => {
    dealDamage(target, SHATTER_BONUS_DAMAGE, {
      cause: EntityDamageCause5.magic,
      damagingEntity: player
    });
    try {
      target.addEffect("weakness", SHATTER_WEAKNESS_TICKS, {
        amplifier: 1,
        // amplifier 1 = Weakness II (0-indexed)
        showParticles: true
        // efek partikel visible supaya target tahu mereka di-debuff
      });
    } catch {
    }
    clearFractureStacks(target);
    try {
      const dim = world5.getDimension(player.dimension.id);
      dim.playSound("random.break", target.location, { volume: 1, pitch: 0.7 });
      dim.playSound("random.break", target.location, { volume: 0.6, pitch: 1.8 });
      dim.playSound("random.levelup", player.location, { volume: 0.4, pitch: 1.4 });
    } catch {
    }
    try {
      player.runCommand("execute as @s run camerashake add @s 0.55 0.45");
    } catch {
    }
  });
}
function playFractureSound(target, stackCount) {
  try {
    world5.getDimension(target.dimension.id).playSound(
      "random.glass",
      target.location,
      { volume: 0.2 + stackCount * 0.05, pitch: 1 + stackCount * 0.15 }
      // stack 1 → pitch 1.15, stack 4 → pitch 1.60 — semakin tinggi = semakin "retak"
    );
  } catch {
  }
}
function tickGreatsword(player) {
  if (!isHoldingWeapon5(player)) return;
  const state = getState5(player);
  resetAttackingFlagIfNeeded(player, state);
  maintainOrReleaseInputLock(player, state);
  if (!state.isAttacking) {
    setState5(player, state);
    return;
  }
  const anim = CONFIG.anims[state.comboIndex % CONFIG.anims.length];
  const prevFrame = state.frame;
  state.frame++;
  if (prevFrame <= 0) {
    state.fractureAppliedThisSwing = false;
  }
  if (anim.hitFrames.includes(state.frame)) {
    const targets = getTargetsInCone(player, anim.range, anim.coneDeg, 10);
    let hitSomething = false;
    for (const t of targets) {
      const stacksBefore = getFractureStacks(t);
      const newStacks = state.fractureAppliedThisSwing ? stacksBefore : addFractureStack(t);
      const dmg = calcDamage4(anim, t, stacksBefore);
      applyHit5(player, t, dmg);
      hitSomething = true;
      if (!state.fractureAppliedThisSwing) {
        if (stacksBefore >= FRACTURE_MAX_STACKS) {
          triggerShatter(player, t);
        } else {
          playFractureSound(t, newStacks);
        }
      }
    }
    state.fractureAppliedThisSwing = true;
    const dir = player.getViewDirection();
    attackStep(player, dir, anim, state);
    if (targets.length > 0) {
      try {
        world5.getDimension(player.dimension.id).playSound(
          "random.anvil_land",
          player.location,
          { volume: 0.6, pitch: 0.85 }
          // lebih rendah dari halberd — ini weapon lebih besar
        );
        if (hitSomething) player.runCommand("execute as @s run camerashake add @s 0.35 0.35");
      } catch {
      }
    }
  }
  handleComboTransitionOrEnd(player, state, CONFIG, setState5);
}
onWeaponHit((ev) => {
  const attacker = ev.damagingEntity;
  if (!attacker || attacker.typeId !== "minecraft:player") return;
  if (!isHoldingWeapon5(attacker)) return;
  const state = getState5(attacker);
  resetAttackingFlagIfNeeded(attacker, state);
  withCooldown(attacker, "greatsword_input", INPUT_COOLDOWN_TICKS5, () => {
    const s = getState5(attacker);
    resetAttackingFlagIfNeeded(attacker, s);
    if (s.isAttacking) {
      bufferNextAttack(attacker, s, setState5, CONFIG);
      return;
    }
    s.fractureAppliedThisSwing = false;
    startAttack(attacker, s, CONFIG, setState5);
  });
});
system8.runInterval(() => {
  for (const p of world5.getPlayers()) safeTick(tickGreatsword)(p);
}, 1);

// scripts/armory/netherite/netherite_relic_blade.ts
import { world as world6, system as system9, EntityDamageCause as EntityDamageCause6 } from "@minecraft/server";
var WEAPON_ID6 = "resonance:netherite_relic_blade";
var BASE_DAMAGE6 = 10;
var INPUT_COOLDOWN_TICKS6 = 2;
var COMBO_RESET_TICKS6 = 40;
var ATTACK_LOCK_TICKS6 = 2;
var ANIM_CONTROLLER6 = "res:relic_blade_combo";
var SOUL_DRAIN_REGEN_TICKS = 40;
var SOUL_DRAIN_WEAKNESS_TICKS = 40;
var BURDEN_MAX_STACKS = 5;
var BURDEN_EXPIRE_TICKS = 100;
var BURDEN_SLOW_TICKS = 30;
var BURDEN_STUN_TICKS = 16;
var BURDEN_STUN_AMPLIFIER = 6;
var BURDEN_PROC_COOLDOWN_TICKS = 8;
var KNOCKBACK_STRENGTH3 = 0.45;
var KNOCKBACK_VERTICAL3 = 0.06;
var ANIMS6 = [
  {
    animation: "animation.netherite_relic_blade.attack",
    attackTime: 26,
    nextAttackWindow: 8,
    cancelIntoNextTick: 19,
    hitFrames: [11],
    range: 3.5,
    coneDeg: 90,
    damageMultiplier: 1
  },
  {
    animation: "animation.netherite_relic_blade.attack1",
    attackTime: 27,
    nextAttackWindow: 8,
    cancelIntoNextTick: 20,
    hitFrames: [13],
    range: 4.5,
    coneDeg: 70,
    damageMultiplier: 1.15
  },
  {
    animation: "animation.netherite_relic_blade.attack2",
    attackTime: 32,
    nextAttackWindow: 6,
    cancelIntoNextTick: 32,
    hitFrames: [13],
    // finisher — sedikit lebih lambat, multiplier tertinggi
    range: 4,
    coneDeg: 80,
    damageMultiplier: 1.4
  }
];
var COMBO_CFG5 = {
  anims: ANIMS6,
  animController: ANIM_CONTROLLER6,
  inputCooldownTicks: INPUT_COOLDOWN_TICKS6,
  attackLockTicks: ATTACK_LOCK_TICKS6,
  comboResetTicks: COMBO_RESET_TICKS6
};
var STATE_KEY6 = "res_relic_blade_state";
var DEFAULT_STATE6 = {
  comboIndex: 0,
  isAttacking: false,
  frame: 0,
  bufferedNext: false,
  lockUntilTick: 0,
  lastAttackTick: 0,
  attackingFlagUntil: 0,
  inputLockUntilTick: 0,
  inputLocked: false,
  burdenAppliedThisSwing: false
};
var getState6 = (p) => {
  const raw = p.getDynamicProperty(STATE_KEY6);
  return raw ? JSON.parse(raw) : { ...DEFAULT_STATE6 };
};
var setState6 = (p, s) => {
  p.setDynamicProperty(STATE_KEY6, JSON.stringify(s));
};
function isHoldingWeapon6(player) {
  const eq = player.getComponent("minecraft:equippable");
  return !!eq && eq.getEquipment?.("Mainhand")?.typeId === WEAPON_ID6;
}
var calcDamage5 = (anim) => Math.floor(BASE_DAMAGE6 * anim.damageMultiplier);
var applyHit6 = safeHit(function applyHit6(player, target, dmg) {
  dealDamage(target, dmg, {
    cause: EntityDamageCause6.entityAttack,
    damagingEntity: player
  });
  const dir = player.getViewDirection();
  target.applyKnockback({ x: dir.x * KNOCKBACK_STRENGTH3, z: dir.z * KNOCKBACK_STRENGTH3 }, KNOCKBACK_VERTICAL3);
});
function applySoulDrain(player, target, burdenStacks) {
  const regenAmp = Math.min(Math.max(burdenStacks - 1, 0), 2);
  const weaknessAmp = Math.min(Math.max(burdenStacks - 1, 0), 2);
  try {
    player.addEffect("regeneration", SOUL_DRAIN_REGEN_TICKS, {
      amplifier: regenAmp,
      showParticles: false
    });
  } catch {
  }
  try {
    target.addEffect("weakness", SOUL_DRAIN_WEAKNESS_TICKS, {
      amplifier: weaknessAmp,
      showParticles: true
    });
  } catch {
  }
}
var burdenMap = /* @__PURE__ */ new Map();
function getTargetKey2(target) {
  return target.id;
}
function getBurdenStacks(target) {
  const key = getTargetKey2(target);
  const data = burdenMap.get(key);
  if (!data) return 0;
  if (system9.currentTick - data.lastTick > BURDEN_EXPIRE_TICKS) {
    burdenMap.delete(key);
    return 0;
  }
  return data.stacks;
}
function setBurdenStacks(target, stacks) {
  const key = getTargetKey2(target);
  if (stacks <= 0) {
    burdenMap.delete(key);
    return;
  }
  burdenMap.set(key, {
    stacks,
    lastTick: system9.currentTick
  });
}
function addBurdenStack(target) {
  const current = getBurdenStacks(target);
  const next = Math.min(current + 1, BURDEN_MAX_STACKS);
  setBurdenStacks(target, next);
  return next;
}
function clearBurdenStacks(target) {
  burdenMap.delete(getTargetKey2(target));
}
function applyBurdenEffect(target, stackCount) {
  if (stackCount >= BURDEN_MAX_STACKS) {
    try {
      target.addEffect("slowness", BURDEN_STUN_TICKS, {
        amplifier: BURDEN_STUN_AMPLIFIER,
        showParticles: true
      });
    } catch {
    }
    clearBurdenStacks(target);
    return;
  }
  const slowAmp = Math.max(0, Math.min(stackCount - 1, 3));
  try {
    target.addEffect("slowness", BURDEN_SLOW_TICKS, {
      amplifier: slowAmp,
      showParticles: true
    });
  } catch {
  }
}
function playBurdenSound(target, stackCount) {
  try {
    world6.getDimension(target.dimension.id).playSound("random.anvil_use", target.location, {
      volume: 0.18 + stackCount * 0.05,
      pitch: 1.15 - stackCount * 0.08
    });
  } catch {
  }
}
function triggerBurdenStun(player, target) {
  withCooldown(player, "relic_blade_burden_proc", BURDEN_PROC_COOLDOWN_TICKS, () => {
    try {
      world6.getDimension(target.dimension.id).playSound("random.anvil_land", target.location, {
        volume: 0.7,
        pitch: 0.65
      });
      world6.getDimension(player.dimension.id).playSound("random.levelup", player.location, {
        volume: 0.3,
        pitch: 1.2
      });
    } catch {
    }
    try {
      player.runCommand("execute as @s run camerashake add @s 0.4 0.35");
    } catch {
    }
  });
}
function tickWeapon5(player) {
  if (!isHoldingWeapon6(player)) return;
  const state = getState6(player);
  resetAttackingFlagIfNeeded(player, state);
  maintainOrReleaseInputLock(player, state);
  if (!state.isAttacking) {
    setState6(player, state);
    return;
  }
  const anim = ANIMS6[state.comboIndex % ANIMS6.length];
  const prevFrame = state.frame;
  state.frame++;
  if (prevFrame <= 0) {
    state.burdenAppliedThisSwing = false;
  }
  if (anim.hitFrames.includes(state.frame)) {
    const targets = getTargetsInCone(player, anim.range, anim.coneDeg, 10);
    let hitSomething = false;
    for (const t of targets) {
      const dmg = calcDamage5(anim);
      applyHit6(player, t, dmg);
      hitSomething = true;
      const stacksAfter = state.burdenAppliedThisSwing ? getBurdenStacks(t) : addBurdenStack(t);
      if (!state.burdenAppliedThisSwing) {
        applyBurdenEffect(t, stacksAfter);
        applySoulDrain(player, t, stacksAfter);
        if (stacksAfter >= BURDEN_MAX_STACKS) {
          triggerBurdenStun(player, t);
        } else {
          playBurdenSound(t, stacksAfter);
        }
      }
    }
    state.burdenAppliedThisSwing = true;
    const dir = player.getViewDirection();
    attackStep(player, dir, anim, state);
    if (hitSomething) {
      try {
        world6.getDimension(player.dimension.id).playSound("random.break", player.location, {
          volume: 0.35,
          pitch: 0.9
        });
        player.runCommand("execute as @s run camerashake add @s 0.22 0.2");
      } catch {
      }
    }
  }
  handleComboTransitionOrEnd(player, state, COMBO_CFG5, setState6);
}
onWeaponHit((ev) => {
  const { damagingEntity: attacker, hitEntity: victim } = ev;
  if (!attacker || attacker.typeId !== "minecraft:player" || !victim) return;
  if (!isHoldingWeapon6(attacker)) return;
  withCooldown(attacker, "netherite_relic_blade_input", INPUT_COOLDOWN_TICKS6, () => {
    const s = getState6(attacker);
    resetAttackingFlagIfNeeded(attacker, s);
    if (s.isAttacking) {
      bufferNextAttack(attacker, s, setState6, COMBO_CFG5);
      return;
    }
    s.burdenAppliedThisSwing = false;
    startAttack(attacker, s, COMBO_CFG5, setState6);
  });
});
system9.runInterval(() => {
  for (const p of world6.getPlayers()) safeTick(tickWeapon5)(p);
}, 1);

// scripts/armory/redstone/restone_pulse_gauntlet.ts
import { world as world7, system as system10, EntityDamageCause as EntityDamageCause7 } from "@minecraft/server";
var WEAPON_ID7 = "resonance:redstone_pulse_gauntlet";
var BASE_DAMAGE7 = 7;
var INPUT_COOLDOWN_TICKS7 = 2;
var COMBO_RESET_TICKS7 = 40;
var ATTACK_LOCK_TICKS7 = 2;
var ANIM_CONTROLLER7 = "res:redstone_pulse_gauntlet_combo";
var OVERCLOCK_MAX_TIER = 2;
var OVERCLOCK_CHAIN_BREAK_TICKS = 26;
var OVERCLOCK_SPEED_TICKS = 80;
var OVERCLOCK_SPEED_AMP_TIER_1 = 1;
var OVERCLOCK_SPEED_AMP_TIER_2 = 2;
var SHORT_CIRCUIT_MIN_TIER = 1;
var SHORT_CIRCUIT_SLOWNESS_TICKS = 60;
var SHORT_CIRCUIT_SLOWNESS_AMPLIFIER = 5;
var SHORT_CIRCUIT_WEAKNESS_TICKS = 60;
var SHORT_CIRCUIT_WEAKNESS_AMPLIFIER = 1;
var CAPACITOR_IDLE_TICKS = 40;
var CAPACITOR_BONUS_DAMAGE = 10;
var CAPACITOR_PROC_COOLDOWN_TICKS = 4;
var KNOCKBACK_STRENGTH4 = 0.35;
var KNOCKBACK_VERTICAL4 = 0.04;
var NORMAL_ANIMS = [
  {
    animation: "animation.redstone_pulse_gauntlet.attack",
    attackTime: 30,
    nextAttackWindow: 8,
    cancelIntoNextTick: 21,
    hitFrames: [17],
    range: 2.5,
    coneDeg: 76,
    damageMultiplier: 1
  },
  {
    animation: "animation.redstone_pulse_gauntlet.attack1",
    attackTime: 30,
    nextAttackWindow: 8,
    cancelIntoNextTick: 18,
    hitFrames: [14],
    range: 2.5,
    coneDeg: 80,
    damageMultiplier: 1.1
  },
  {
    animation: "animation.redstone_pulse_gauntlet.attack2",
    attackTime: 29,
    nextAttackWindow: 8,
    cancelIntoNextTick: 29,
    hitFrames: [13],
    range: 2.7,
    coneDeg: 84,
    damageMultiplier: 1.25
  }
];
var FAST_ANIMS = [
  {
    animation: "animation.redstone_pulse_gauntlet.fast_attack",
    attackTime: 30,
    nextAttackWindow: 8,
    cancelIntoNextTick: 15,
    hitFrames: [11],
    range: 2.5,
    coneDeg: 78,
    damageMultiplier: 1.05
  },
  {
    animation: "animation.redstone_pulse_gauntlet.fast_attack1",
    attackTime: 29,
    nextAttackWindow: 8,
    cancelIntoNextTick: 13,
    hitFrames: [9],
    range: 2.5,
    coneDeg: 82,
    damageMultiplier: 1.15
  },
  {
    animation: "animation.redstone_pulse_gauntlet.fast_attack2",
    attackTime: 29,
    nextAttackWindow: 8,
    cancelIntoNextTick: 13,
    hitFrames: [9],
    range: 2.7,
    coneDeg: 86,
    damageMultiplier: 1.3
  }
];
var MAX_ANIMS = [
  {
    animation: "animation.redstone_pulse_gauntlet.fast_attack3",
    attackTime: 29,
    nextAttackWindow: 8,
    cancelIntoNextTick: 13,
    hitFrames: [9],
    range: 3.3,
    coneDeg: 80,
    damageMultiplier: 1.1
  },
  {
    animation: "animation.redstone_pulse_gauntlet.fast_attack1",
    attackTime: 29,
    nextAttackWindow: 8,
    cancelIntoNextTick: 13,
    hitFrames: [9],
    range: 2.5,
    coneDeg: 82,
    damageMultiplier: 1.15
  },
  {
    animation: "animation.redstone_pulse_gauntlet.fast_attack2",
    attackTime: 29,
    nextAttackWindow: 8,
    cancelIntoNextTick: 13,
    hitFrames: [9],
    range: 2.7,
    coneDeg: 86,
    damageMultiplier: 1.3
  }
];
var BASE_COMBO_CFG = {
  anims: NORMAL_ANIMS,
  animController: ANIM_CONTROLLER7,
  inputCooldownTicks: INPUT_COOLDOWN_TICKS7,
  attackLockTicks: ATTACK_LOCK_TICKS7,
  comboResetTicks: COMBO_RESET_TICKS7
};
var STATE_KEY7 = "res_redstone_pulse_gauntlet_state";
var DEFAULT_STATE7 = {
  comboIndex: 0,
  isAttacking: false,
  frame: 0,
  bufferedNext: false,
  lockUntilTick: 0,
  lastAttackTick: 0,
  attackingFlagUntil: 0,
  inputLockUntilTick: 0,
  inputLocked: false,
  overclockTier: 0,
  cycleTierLocked: 0,
  nextCycleTierLocked: 0,
  successfulHitsThisCycle: 0,
  cycleUpgradeApplied: false,
  overclockAppliedThisSwing: false,
  capacitorConsumedThisSwing: false,
  lastSuccessfulHitTick: 0
};
var getState7 = (p) => {
  const raw = p.getDynamicProperty(STATE_KEY7);
  return raw ? JSON.parse(raw) : { ...DEFAULT_STATE7 };
};
var setState7 = (p, s) => {
  p.setDynamicProperty(STATE_KEY7, JSON.stringify(s));
};
function isHoldingWeapon7(player) {
  const eq = player.getComponent("minecraft:equippable");
  return !!eq && eq.getEquipment?.("Mainhand")?.typeId === WEAPON_ID7;
}
function getAnimSetForTier(tier) {
  switch (tier) {
    case 2:
      return MAX_ANIMS;
    case 1:
      return FAST_ANIMS;
    default:
      return NORMAL_ANIMS;
  }
}
function getRuntimeConfig(state) {
  const currentSet = getAnimSetForTier(state.cycleTierLocked);
  if (state.isAttacking && state.comboIndex === 2 && state.nextCycleTierLocked !== state.cycleTierLocked) {
    const nextSet = getAnimSetForTier(state.nextCycleTierLocked);
    return {
      ...BASE_COMBO_CFG,
      anims: [
        nextSet[0],
        // dipakai jika combo loop ke attack pertama berikutnya
        nextSet[1],
        currentSet[2]
        // finisher current cycle tetap pakai tier saat ini
      ],
      animController: ANIM_CONTROLLER7
    };
  }
  return {
    ...BASE_COMBO_CFG,
    anims: currentSet,
    animController: ANIM_CONTROLLER7
  };
}
function getCurrentAnim(state) {
  const cfg = getRuntimeConfig(state);
  return cfg.anims[state.comboIndex % cfg.anims.length];
}
var calcDamage6 = (anim) => Math.floor(BASE_DAMAGE7 * anim.damageMultiplier);
var applyHit7 = safeHit(function applyHit7(player, target, dmg) {
  dealDamage(target, dmg, {
    cause: EntityDamageCause7.entityAttack,
    damagingEntity: player
  });
  const dir = player.getViewDirection();
  target.applyKnockback({ x: dir.x * KNOCKBACK_STRENGTH4, z: dir.z * KNOCKBACK_STRENGTH4 }, KNOCKBACK_VERTICAL4);
});
function resetOverclock(state) {
  state.overclockTier = 0;
  state.cycleTierLocked = 0;
  state.nextCycleTierLocked = 0;
  state.successfulHitsThisCycle = 0;
  state.cycleUpgradeApplied = false;
}
function triggerOverclockSpeed(player, tier) {
  if (tier <= 0) return;
  const amp = tier >= 2 ? OVERCLOCK_SPEED_AMP_TIER_2 : OVERCLOCK_SPEED_AMP_TIER_1;
  try {
    player.addEffect("haste", OVERCLOCK_SPEED_TICKS, {
      amplifier: amp,
      showParticles: true
    });
  } catch {
  }
  try {
    world7.getDimension(player.dimension.id).playSound("random.levelup", player.location, {
      volume: tier >= 2 ? 0.35 : 0.26,
      pitch: tier >= 2 ? 1.6 : 1.45
    });
  } catch {
  }
}
function triggerShortCircuit(player, state) {
  if (state.overclockTier < SHORT_CIRCUIT_MIN_TIER) {
    resetOverclock(state);
    return;
  }
  try {
    player.addEffect("slowness", SHORT_CIRCUIT_SLOWNESS_TICKS, {
      amplifier: SHORT_CIRCUIT_SLOWNESS_AMPLIFIER,
      showParticles: true
    });
  } catch {
  }
  try {
    player.addEffect("weakness", SHORT_CIRCUIT_WEAKNESS_TICKS, {
      amplifier: SHORT_CIRCUIT_WEAKNESS_AMPLIFIER,
      showParticles: true
    });
  } catch {
  }
  try {
    world7.getDimension(player.dimension.id).playSound("random.fizz", player.location, {
      volume: 0.55,
      pitch: 0.7
    });
    player.runCommand("execute as @s run camerashake add @s 0.45 0.25");
  } catch {
  }
  resetOverclock(state);
}
function isCapacitorReady(state) {
  if (state.lastSuccessfulHitTick <= 0) return false;
  return system10.currentTick - state.lastSuccessfulHitTick >= CAPACITOR_IDLE_TICKS;
}
function triggerCapacitorBurst(player, primaryTarget) {
  withCooldown(player, "redstone_pulse_gauntlet_capacitor", CAPACITOR_PROC_COOLDOWN_TICKS, () => {
    dealDamage(primaryTarget, CAPACITOR_BONUS_DAMAGE, {
      cause: EntityDamageCause7.entityAttack,
      damagingEntity: player
    });
    try {
      world7.getDimension(primaryTarget.dimension.id).playSound("random.orb", primaryTarget.location, {
        volume: 0.6,
        pitch: 1.8
      });
      player.runCommand("execute as @s run camerashake add @s 0.35 0.2");
    } catch {
    }
  });
}
function markSuccessfulSwing(state) {
  if (state.overclockAppliedThisSwing) return;
  state.overclockAppliedThisSwing = true;
  state.successfulHitsThisCycle = Math.min(3, state.successfulHitsThisCycle + 1);
}
function tryPromoteCycleTier(player, state) {
  if (state.comboIndex !== 2) return;
  if (state.cycleUpgradeApplied) return;
  if (state.successfulHitsThisCycle < 3) return;
  const nextTier = Math.min(state.overclockTier + 1, OVERCLOCK_MAX_TIER);
  state.cycleUpgradeApplied = true;
  state.overclockTier = nextTier;
  state.nextCycleTierLocked = nextTier;
  triggerOverclockSpeed(player, nextTier);
}
function resetCycleFlagsForNewSwing(state) {
  state.overclockAppliedThisSwing = false;
  state.capacitorConsumedThisSwing = false;
}
function beginNewCycle(state) {
  state.cycleTierLocked = state.nextCycleTierLocked;
  state.successfulHitsThisCycle = 0;
  state.cycleUpgradeApplied = false;
  resetCycleFlagsForNewSwing(state);
}
function tickWeapon6(player) {
  if (!isHoldingWeapon7(player)) return;
  const state = getState7(player);
  resetAttackingFlagIfNeeded(player, state);
  maintainOrReleaseInputLock(player, state);
  if (!state.isAttacking && state.overclockTier > 0) {
    const idleTicks = system10.currentTick - state.lastSuccessfulHitTick;
    if (state.lastSuccessfulHitTick > 0 && idleTicks > OVERCLOCK_CHAIN_BREAK_TICKS) {
      triggerShortCircuit(player, state);
      setState7(player, state);
      return;
    }
  }
  if (!state.isAttacking) {
    setState7(player, state);
    return;
  }
  const prevComboIndex = state.comboIndex;
  const wasAttackingBeforeStep = state.isAttacking;
  const anim = getCurrentAnim(state);
  state.frame++;
  if (state.frame === 1) {
    resetCycleFlagsForNewSwing(state);
  }
  if (anim.hitFrames.includes(state.frame)) {
    const targets = getTargetsInCone(player, anim.range, anim.coneDeg, 10);
    const dir = player.getViewDirection();
    attackStep(player, dir, anim, state);
    if (targets.length > 0) {
      const baseDmg = calcDamage6(anim);
      const capacitorReady = !state.capacitorConsumedThisSwing && isCapacitorReady(state);
      let hitSomething = false;
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        applyHit7(player, t, baseDmg);
        hitSomething = true;
        if (i === 0 && capacitorReady) {
          triggerCapacitorBurst(player, t);
        }
      }
      if (hitSomething) {
        state.lastSuccessfulHitTick = system10.currentTick;
        markSuccessfulSwing(state);
        tryPromoteCycleTier(player, state);
        if (capacitorReady) {
          state.capacitorConsumedThisSwing = true;
          try {
            world7.getDimension(player.dimension.id).playSound("random.anvil_use", player.location, {
              volume: 0.35,
              pitch: 1.65
            });
          } catch {
          }
        }
        try {
          world7.getDimension(player.dimension.id).playSound("random.fuse", player.location, {
            volume: 0.25,
            pitch: 1.3 + state.overclockTier * 0.08
          });
          player.runCommand("execute as @s run camerashake add @s 0.2 0.15");
        } catch {
        }
      }
    }
  }
  handleComboTransitionOrEnd(player, state, getRuntimeConfig(state), setState7);
  if (wasAttackingBeforeStep && state.isAttacking && prevComboIndex === 2 && state.comboIndex === 0) {
    beginNewCycle(state);
  }
  setState7(player, state);
}
onWeaponHit((ev) => {
  const { damagingEntity: attacker, hitEntity: victim } = ev;
  if (!attacker || attacker.typeId !== "minecraft:player" || !victim) return;
  if (!isHoldingWeapon7(attacker)) return;
  withCooldown(attacker, "redstone_pulse_gauntlet_input", INPUT_COOLDOWN_TICKS7, () => {
    const s = getState7(attacker);
    resetAttackingFlagIfNeeded(attacker, s);
    if (s.isAttacking) {
      bufferNextAttack(attacker, s, setState7, getRuntimeConfig(s));
      return;
    }
    s.cycleTierLocked = s.overclockTier;
    s.nextCycleTierLocked = s.overclockTier;
    s.successfulHitsThisCycle = 0;
    s.cycleUpgradeApplied = false;
    resetCycleFlagsForNewSwing(s);
    startAttack(attacker, s, getRuntimeConfig(s), setState7);
  });
});
system10.runInterval(() => {
  for (const p of world7.getPlayers()) safeTick(tickWeapon6)(p);
}, 1);

// scripts/armory/quartz/lunar_crescent.ts
import { world as world8, system as system11, EntityDamageCause as EntityDamageCause8 } from "@minecraft/server";
var WEAPON_ID8 = "resonance:lunar_crescent";
var BASE_DAMAGE8 = 11;
var MOONLIGHT_DAMAGE_MULTIPLIER = 1.8;
var DARK_LIGHT_LEVEL = 7;
var NIGHT_START = 13e3;
var NIGHT_END = 23e3;
var INPUT_COOLDOWN_TICKS8 = 2;
var COMBO_RESET_TICKS8 = 40;
var ATTACK_LOCK_TICKS8 = 2;
var ANIM_CONTROLLER8 = "res:lunar_crescent";
var RETURN_DURATION_TICKS = 10;
var RETURN_DISTANCE = 3;
var RETURN_VERTICAL_OFFSET = 1;
var MAX_RETURN_DISTANCE = 8;
var SLOWNESS_TICKS = 20;
var SLOWNESS_AMPLIFIER = 1;
var ANIMS7 = [
  {
    animation: "animation.lunar_crescent.attack",
    /**
     * Shorter than Greatsword because Crescent is intended
     * to feel agile and controlled.
     */
    attackTime: 38,
    nextAttackWindow: 10,
    cancelIntoNextTick: 38,
    /**
     * Two adjacent hit frames create a small hit window.
     *
     * Guarded by hitAppliedThisSwing so one target cannot
     * receive damage twice from the same swing.
     */
    hitFrames: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
    range: 5.5,
    coneDeg: 85,
    damageMultiplier: 1
  }
];
var CONFIG2 = {
  anims: ANIMS7,
  animController: ANIM_CONTROLLER8,
  inputCooldownTicks: INPUT_COOLDOWN_TICKS8,
  attackLockTicks: ATTACK_LOCK_TICKS8,
  comboResetTicks: COMBO_RESET_TICKS8
};
var STATE_KEY8 = "res_lunar_crescent_state";
var DEFAULT_STATE8 = {
  comboIndex: 0,
  isAttacking: false,
  frame: 0,
  bufferedNext: false,
  lockUntilTick: 0,
  lastAttackTick: 0,
  attackingFlagUntil: 0,
  inputLockUntilTick: 0,
  inputLocked: false,
  hitAppliedThisSwing: false
};
var getState8 = (player) => {
  const raw = player.getDynamicProperty(STATE_KEY8);
  return raw ? JSON.parse(raw) : { ...DEFAULT_STATE8 };
};
var setState8 = (player, state) => {
  player.setDynamicProperty(STATE_KEY8, JSON.stringify(state));
};
function isHoldingWeapon8(player) {
  const equippable = player.getComponent("minecraft:equippable");
  return !!equippable && equippable.getEquipment?.("Mainhand")?.typeId === WEAPON_ID8;
}
function isNighttime() {
  try {
    const time = world8.getTimeOfDay();
    return time >= NIGHT_START && time < NIGHT_END;
  } catch {
    return false;
  }
}
function getPlayerLightLevel(player) {
  try {
    const dimension = world8.getDimension(player.dimension.id);
    const location = player.location;
    const feetBlock = dimension.getBlock({
      x: Math.floor(location.x),
      y: Math.floor(location.y),
      z: Math.floor(location.z)
    });
    const headBlock = dimension.getBlock({
      x: Math.floor(location.x),
      y: Math.floor(location.y + 1),
      z: Math.floor(location.z)
    });
    const feetLight = feetBlock?.getLightLevel?.() ?? 15;
    const headLight = headBlock?.getLightLevel?.() ?? 15;
    return Math.min(Number(feetLight), Number(headLight));
  } catch {
    return 15;
  }
}
function hasMoonlight(player) {
  if (isNighttime()) {
    return true;
  }
  const lightLevel = getPlayerLightLevel(player);
  return lightLevel <= DARK_LIGHT_LEVEL;
}
function calcDamage7(player, anim) {
  const baseDamage = BASE_DAMAGE8 * anim.damageMultiplier;
  const empoweredByMoonlight = hasMoonlight(player);
  if (!empoweredByMoonlight) {
    return Math.floor(baseDamage);
  }
  return Math.floor(baseDamage * MOONLIGHT_DAMAGE_MULTIPLIER);
}
function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function getForwardPosition(player) {
  const origin = player.location;
  const direction = player.getViewDirection();
  return {
    x: origin.x + direction.x * RETURN_DISTANCE,
    y: origin.y + RETURN_VERTICAL_OFFSET + direction.y * RETURN_DISTANCE,
    z: origin.z + direction.z * RETURN_DISTANCE
  };
}
var returningTargets = /* @__PURE__ */ new Map();
function startReturningCrescent(player, target) {
  const targetId = target.id;
  returningTargets.set(targetId, {
    playerId: player.id,
    targetId,
    expiresAt: system11.currentTick + RETURN_DURATION_TICKS
  });
  try {
    target.addEffect("slowness", SLOWNESS_TICKS, {
      amplifier: SLOWNESS_AMPLIFIER,
      showParticles: true
    });
  } catch {
  }
  try {
    const dimension = world8.getDimension(player.dimension.id);
    dimension.playSound("random.orb", target.location, {
      volume: 0.65,
      pitch: 0.65
    });
  } catch {
  }
}
function tickReturningTargets() {
  for (const [targetId, data] of returningTargets) {
    if (system11.currentTick >= data.expiresAt) {
      returningTargets.delete(targetId);
      continue;
    }
    let player;
    let target;
    try {
      player = world8.getPlayers().find((p) => p.id === data.playerId);
      if (!player) {
        returningTargets.delete(targetId);
        continue;
      }
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: MAX_RETURN_DISTANCE
      });
      target = entities.find((entity) => entity.id === targetId);
      if (!target) {
        returningTargets.delete(targetId);
        continue;
      }
      if (target.dimension.id !== player.dimension.id) {
        returningTargets.delete(targetId);
        continue;
      }
      const destination = getForwardPosition(player);
      if (distance(player.location, target.location) > MAX_RETURN_DISTANCE) {
        returningTargets.delete(targetId);
        continue;
      }
      target.teleport(destination, {
        dimension: player.dimension,
        rotation: target.getRotation()
      });
    } catch {
      returningTargets.delete(targetId);
    }
  }
}
var applyHit8 = safeHit(function applyHit8(player, target, anim) {
  const damage = calcDamage7(player, anim);
  dealDamage(target, damage, {
    cause: EntityDamageCause8.entityAttack,
    damagingEntity: player
  });
  startReturningCrescent(player, target);
});
function playMoonlightHitSound(player, empowered) {
  try {
    const dimension = world8.getDimension(player.dimension.id);
    if (empowered) {
      dimension.playSound("random.orb", player.location, {
        volume: 0.8,
        pitch: 0.55
      });
      dimension.playSound("random.levelup", player.location, {
        volume: 0.25,
        pitch: 1.6
      });
    } else {
      dimension.playSound("random.attack", player.location, {
        volume: 0.6,
        pitch: 1.1
      });
    }
  } catch {
  }
}
function tickWeapon7(player) {
  if (!isHoldingWeapon8(player)) {
    return;
  }
  const state = getState8(player);
  resetAttackingFlagIfNeeded(player, state);
  maintainOrReleaseInputLock(player, state);
  if (!state.isAttacking) {
    setState8(player, state);
    return;
  }
  const anim = ANIMS7[0];
  const previousFrame = state.frame;
  state.frame++;
  if (previousFrame <= 0) {
    state.hitAppliedThisSwing = false;
  }
  if (anim.hitFrames.includes(state.frame) && !state.hitAppliedThisSwing) {
    const targets = getTargetsInCone(player, anim.range, anim.coneDeg, 10);
    let hitSomething = false;
    const empowered = hasMoonlight(player);
    for (const target of targets) {
      applyHit8(player, target, anim);
      hitSomething = true;
    }
    if (state.frame === anim.hitFrames[0]) {
      const direction = player.getViewDirection();
      attackStep(player, direction, anim, state);
    }
    if (hitSomething) {
      state.hitAppliedThisSwing = true;
      playMoonlightHitSound(player, empowered);
      try {
        player.runCommand("execute as @s run camerashake add @s 0.2 0.2");
      } catch {
      }
    } else if (state.frame === anim.hitFrames[anim.hitFrames.length - 1]) {
      playMoonlightHitSound(player, false);
    }
  }
  handleComboTransitionOrEnd(player, state, CONFIG2, setState8);
}
onWeaponHit((ev) => {
  const { damagingEntity: attacker, hitEntity: victim } = ev;
  if (!attacker || attacker.typeId !== "minecraft:player" || !victim) {
    return;
  }
  if (!isHoldingWeapon8(attacker)) {
    return;
  }
  withCooldown(attacker, "lunar_crescent_input", INPUT_COOLDOWN_TICKS8, () => {
    const state = getState8(attacker);
    resetAttackingFlagIfNeeded(attacker, state);
    if (state.isAttacking) {
      bufferNextAttack(attacker, state, setState8, CONFIG2);
      return;
    }
    state.hitAppliedThisSwing = false;
    startAttack(attacker, state, CONFIG2, setState8);
  });
});
system11.runInterval(() => {
  for (const player of world8.getPlayers()) {
    safeTick(tickWeapon7)(player);
  }
  tickReturningTargets();
}, 1);

// scripts/armory/amethyst/amethyst_glaive.ts
import { world as world9, system as system12, EntityDamageCause as EntityDamageCause9 } from "@minecraft/server";
var WEAPON_ID9 = "resonance:amethyst_glaive";
var BASE_DAMAGE9 = 9;
var INPUT_COOLDOWN_TICKS9 = 2;
var COMBO_RESET_TICKS9 = 40;
var ATTACK_LOCK_TICKS9 = 2;
var ANIM_CONTROLLER9 = "res:amethyst_glaive_combo";
var RESONANCE_MAX_STACKS = 3;
var RESONANCE_EXPIRE_TICKS = 80;
var CHIME_DAMAGE = 8;
var CHIME_SPLASH_DAMAGE = 4;
var CHIME_RADIUS = 2.5;
var CHIME_COOLDOWN_TICKS = 30;
var CHIME_SPEED_TICKS = 50;
var ANIMS9 = [
  {
    animation: "animation.amethyst_glaive.attack",
    attackTime: 16,
    nextAttackWindow: 4,
    cancelIntoNextTick: 16,
    hitFrames: [7, 8],
    range: 4.2,
    coneDeg: 40,
    damageMultiplier: 1
  },
  {
    animation: "animation.amethyst_glaive.attack1",
    attackTime: 18,
    nextAttackWindow: 4,
    cancelIntoNextTick: 18,
    hitFrames: [8, 9],
    range: 3.8,
    coneDeg: 150,
    damageMultiplier: 1.1
  },
  {
    animation: "animation.amethyst_glaive.attack2",
    attackTime: 21,
    nextAttackWindow: 6,
    cancelIntoNextTick: 21,
    hitFrames: [10, 11],
    range: 4,
    coneDeg: 70,
    damageMultiplier: 1.4
  }
];
var COMBO_CFG9 = {
  anims: ANIMS9,
  animController: ANIM_CONTROLLER9,
  inputCooldownTicks: INPUT_COOLDOWN_TICKS9,
  attackLockTicks: ATTACK_LOCK_TICKS9,
  comboResetTicks: COMBO_RESET_TICKS9
};
var STATE_KEY9 = "res_amethyst_glaive_state";
var DEFAULT_STATE9 = {
  comboIndex: 0,
  isAttacking: false,
  frame: 0,
  bufferedNext: false,
  lockUntilTick: 0,
  lastAttackTick: 0,
  attackingFlagUntil: 0,
  inputLockUntilTick: 0,
  inputLocked: false,
  resonanceAppliedThisSwing: false
};
var getState9 = (p) => {
  const r = p.getDynamicProperty(STATE_KEY9);
  return r ? JSON.parse(r) : { ...DEFAULT_STATE9 };
};
var setState9 = (p, s) => p.setDynamicProperty(STATE_KEY9, JSON.stringify(s));
function isHoldingWeapon9(player) {
  const eq = player.getComponent("minecraft:equippable");
  return !!eq && eq.getEquipment?.("Mainhand")?.typeId === WEAPON_ID9;
}
var resonanceMap = /* @__PURE__ */ new Map();
function getResonanceStacks(target) {
  const data = resonanceMap.get(target.id);
  if (!data) return 0;
  if (system12.currentTick - data.lastTick > RESONANCE_EXPIRE_TICKS) {
    resonanceMap.delete(target.id);
    return 0;
  }
  return data.stacks;
}
function addResonanceStack(target) {
  const next = Math.min(getResonanceStacks(target) + 1, RESONANCE_MAX_STACKS);
  resonanceMap.set(target.id, { stacks: next, lastTick: system12.currentTick });
  return next;
}
var calcDamage9 = (anim) => Math.floor(BASE_DAMAGE9 * anim.damageMultiplier);
var applyHit9 = safeHit((player, target, dmg) => {
  dealDamage(target, dmg, { cause: EntityDamageCause9.entityAttack, damagingEntity: player });
  const dir = player.getViewDirection();
  target.applyKnockback({ x: dir.x * 0.5, z: dir.z * 0.5 }, 0.1);
});
function playChimeSound(location, dimension, stacks) {
  try {
    dimension.playSound("chime.amethyst_block", location, { volume: 0.6, pitch: 0.8 + stacks * 0.2 });
  } catch {
  }
}
function triggerChimeBurst(player, target) {
  withCooldown(player, "amethyst_glaive_chime", CHIME_COOLDOWN_TICKS, () => {
    const dim = target.dimension;
    dealDamage(target, CHIME_DAMAGE, { cause: EntityDamageCause9.magic, damagingEntity: player });
    const nearby = dim.getEntities({ location: target.location, maxDistance: CHIME_RADIUS, excludeTypes: NON_TARGET_TYPES }) || [];
    drawAreaRadius(player, target.location, CHIME_RADIUS);
    for (const e of nearby) {
      if (!e || e.id === player.id || e.id === target.id) continue;
      if (!e.getComponent?.("minecraft:health")) continue;
      if (e.getComponent("minecraft:tameable")?.tamedToPlayerId === player.id) continue;
      try {
        dealDamage(e, CHIME_SPLASH_DAMAGE, { cause: EntityDamageCause9.magic, damagingEntity: player });
      } catch {
      }
    }
    resonanceMap.delete(target.id);
    try {
      player.addEffect("speed", CHIME_SPEED_TICKS, { amplifier: 0, showParticles: false });
    } catch {
    }
    try {
      for (let i = 0; i < 8; i++) {
        dim.spawnParticle("minecraft:endrod", {
          x: target.location.x + (Math.random() - 0.5) * 1.5,
          y: target.location.y + 0.5 + Math.random() * 1.5,
          z: target.location.z + (Math.random() - 0.5) * 1.5
        });
      }
      dim.playSound("break.amethyst_cluster", target.location, { volume: 0.9, pitch: 1.1 });
      dim.playSound("chime.amethyst_block", target.location, { volume: 1, pitch: 1.6 });
      player.runCommand("execute as @s run camerashake add @s 0.35 0.3");
    } catch {
    }
  });
}
function tickWeapon9(player) {
  if (!isHoldingWeapon9(player)) return;
  const state = getState9(player);
  resetAttackingFlagIfNeeded(player, state);
  maintainOrReleaseInputLock(player, state);
  if (!state.isAttacking) {
    setState9(player, state);
    return;
  }
  const anim = ANIMS9[state.comboIndex % ANIMS9.length];
  const prevFrame = state.frame;
  state.frame++;
  if (prevFrame <= 0) state.resonanceAppliedThisSwing = false;
  if (anim.hitFrames.includes(state.frame)) {
    const targets = getTargetsInCone(player, anim.range, anim.coneDeg, 10);
    const dir = player.getViewDirection();
    attackStep(player, dir, anim, state);
    for (const t of targets) {
      applyHit9(player, t, calcDamage9(anim));
      if (!state.resonanceAppliedThisSwing) {
        const stacks = addResonanceStack(t);
        if (stacks >= RESONANCE_MAX_STACKS) triggerChimeBurst(player, t);
        else playChimeSound(t.location, t.dimension, stacks);
      }
    }
    if (targets.length > 0) {
      state.resonanceAppliedThisSwing = true;
      try {
        player.runCommand("execute as @s run camerashake add @s 0.2 0.2");
      } catch {
      }
    }
  }
  handleComboTransitionOrEnd(player, state, COMBO_CFG9, setState9);
}
onWeaponHit((ev) => {
  const { damagingEntity: attacker, hitEntity: victim } = ev;
  if (!attacker || attacker.typeId !== "minecraft:player" || !victim) return;
  if (!isHoldingWeapon9(attacker)) return;
  withCooldown(attacker, "amethyst_glaive_input", INPUT_COOLDOWN_TICKS9, () => {
    const s = getState9(attacker);
    resetAttackingFlagIfNeeded(attacker, s);
    if (s.isAttacking) {
      bufferNextAttack(attacker, s, setState9, COMBO_CFG9);
      return;
    }
    s.resonanceAppliedThisSwing = false;
    startAttack(attacker, s, COMBO_CFG9, setState9);
  });
});
system12.runInterval(() => world9.getPlayers().forEach(safeTick(tickWeapon9)), 1);

// scripts/armory/blaze/blaze_scimitar.ts
import { world as world10, system as system13, EntityDamageCause as EntityDamageCause10 } from "@minecraft/server";
var WEAPON_ID10 = "resonance:blaze_scimitar";
var BASE_DAMAGE10 = 7;
var INPUT_COOLDOWN_TICKS10 = 2;
var COMBO_RESET_TICKS10 = 40;
var ATTACK_LOCK_TICKS10 = 2;
var ANIM_CONTROLLER10 = "res:blaze_scimitar_combo";
var IGNITE_SECONDS = 3;
var EMBER_MAX_STACKS = 5;
var EMBER_EXPIRE_TICKS = 100;
var EMBER_BURST_DAMAGE_PER_STACK = 2;
var EMBER_BURST_RADIUS = 3;
var EMBER_BURST_COOLDOWN_TICKS = 40;
var EMBER_FIRE_RES_TICKS = 60;
var ANIMS10 = [
  {
    animation: "animation.blaze_scimitar.attack",
    attackTime: 13,
    nextAttackWindow: 3,
    cancelIntoNextTick: 13,
    hitFrames: [6, 7],
    range: 3,
    coneDeg: 90,
    damageMultiplier: 1
  },
  {
    animation: "animation.blaze_scimitar.attack1",
    attackTime: 13,
    nextAttackWindow: 3,
    cancelIntoNextTick: 13,
    hitFrames: [6, 7],
    range: 3,
    coneDeg: 90,
    damageMultiplier: 1.1
  },
  {
    animation: "animation.blaze_scimitar.attack2",
    attackTime: 18,
    nextAttackWindow: 5,
    cancelIntoNextTick: 18,
    hitFrames: [8, 9],
    range: 3.2,
    coneDeg: 70,
    damageMultiplier: 1.3
  }
];
var COMBO_CFG10 = {
  anims: ANIMS10,
  animController: ANIM_CONTROLLER10,
  inputCooldownTicks: INPUT_COOLDOWN_TICKS10,
  attackLockTicks: ATTACK_LOCK_TICKS10,
  comboResetTicks: COMBO_RESET_TICKS10
};
var STATE_KEY10 = "res_blaze_scimitar_state";
var DEFAULT_STATE10 = {
  comboIndex: 0,
  isAttacking: false,
  frame: 0,
  bufferedNext: false,
  lockUntilTick: 0,
  lastAttackTick: 0,
  attackingFlagUntil: 0,
  inputLockUntilTick: 0,
  inputLocked: false,
  embers: 0,
  lastEmberTick: 0,
  emberAppliedThisSwing: false
};
var getState10 = (p) => {
  const r = p.getDynamicProperty(STATE_KEY10);
  return r ? JSON.parse(r) : { ...DEFAULT_STATE10 };
};
var setState10 = (p, s) => p.setDynamicProperty(STATE_KEY10, JSON.stringify(s));
function isHoldingWeapon10(player) {
  const eq = player.getComponent("minecraft:equippable");
  return !!eq && eq.getEquipment?.("Mainhand")?.typeId === WEAPON_ID10;
}
var calcDamage10 = (anim) => Math.floor(BASE_DAMAGE10 * anim.damageMultiplier);
function isBurning(entity) {
  try {
    if (entity.getComponent("minecraft:onfire")) return true;
  } catch {
  }
  return false;
}
var applyHit10 = safeHit((player, target, dmg) => {
  dealDamage(target, dmg, { cause: EntityDamageCause10.entityAttack, damagingEntity: player });
  try {
    target.setOnFire(IGNITE_SECONDS, true);
  } catch {
  }
});
function spawnEmbers(dimension, center, count) {
  for (let i = 0; i < count; i++) {
    try {
      dimension.spawnParticle("minecraft:basic_flame_particle", {
        x: center.x + (Math.random() - 0.5) * 2,
        y: center.y + 0.3 + Math.random() * 1.2,
        z: center.z + (Math.random() - 0.5) * 2
      });
    } catch {
    }
  }
}
function triggerEmberBurst(player, primaryTarget, state) {
  const stacks = state.embers;
  if (stacks <= 0) return;
  withCooldown(player, "blaze_scimitar_burst", EMBER_BURST_COOLDOWN_TICKS, () => {
    const dim = primaryTarget.dimension;
    const dmg = stacks * EMBER_BURST_DAMAGE_PER_STACK;
    const nearby = dim.getEntities({ location: primaryTarget.location, maxDistance: EMBER_BURST_RADIUS, excludeTypes: NON_TARGET_TYPES }) || [];
    drawAreaRadius(player, primaryTarget.location, EMBER_BURST_RADIUS);
    for (const e of nearby) {
      if (!e || e.id === player.id) continue;
      if (!e.getComponent?.("minecraft:health")) continue;
      if (e.getComponent("minecraft:tameable")?.tamedToPlayerId === player.id) continue;
      try {
        dealDamage(e, dmg, { cause: EntityDamageCause10.fire, damagingEntity: player });
        e.setOnFire(IGNITE_SECONDS + stacks, true);
      } catch {
      }
    }
    state.embers = 0;
    try {
      player.addEffect("fire_resistance", EMBER_FIRE_RES_TICKS, { amplifier: 0, showParticles: false });
    } catch {
    }
    spawnEmbers(dim, primaryTarget.location, 6 + stacks * 3);
    try {
      dim.playSound("mob.blaze.shoot", primaryTarget.location, { volume: 0.8, pitch: 0.9 });
      dim.playSound("fire.ignite", primaryTarget.location, { volume: 0.7, pitch: 0.8 });
      player.runCommand("execute as @s run camerashake add @s 0.3 0.3");
    } catch {
    }
  });
}
function tickWeapon10(player) {
  if (!isHoldingWeapon10(player)) return;
  const state = getState10(player);
  resetAttackingFlagIfNeeded(player, state);
  maintainOrReleaseInputLock(player, state);
  if (state.embers > 0 && system13.currentTick - state.lastEmberTick > EMBER_EXPIRE_TICKS) {
    state.embers = 0;
  }
  if (!state.isAttacking) {
    setState10(player, state);
    return;
  }
  const anim = ANIMS10[state.comboIndex % ANIMS10.length];
  const prevFrame = state.frame;
  state.frame++;
  if (prevFrame <= 0) state.emberAppliedThisSwing = false;
  if (anim.hitFrames.includes(state.frame)) {
    const targets = getTargetsInCone(player, anim.range, anim.coneDeg, 10);
    const dir = player.getViewDirection();
    attackStep(player, dir, anim, state);
    if (targets.length > 0) {
      const dmg = calcDamage10(anim);
      let burningHit = false;
      for (const t of targets) {
        if (isBurning(t)) burningHit = true;
        applyHit10(player, t, dmg);
      }
      if (!state.emberAppliedThisSwing) {
        state.emberAppliedThisSwing = true;
        if (burningHit) {
          state.embers = Math.min(EMBER_MAX_STACKS, state.embers + 1);
          state.lastEmberTick = system13.currentTick;
        }
        if (state.comboIndex % ANIMS10.length === 2) triggerEmberBurst(player, targets[0], state);
      }
      spawnEmbers(player.dimension, targets[0].location, 2);
      try {
        player.dimension.playSound("mob.blaze.hit", targets[0].location, { volume: 0.4, pitch: 1.1 + state.embers * 0.08 });
        player.runCommand("execute as @s run camerashake add @s 0.18 0.15");
      } catch {
      }
    }
  }
  handleComboTransitionOrEnd(player, state, COMBO_CFG10, setState10);
}
onWeaponHit((ev) => {
  const { damagingEntity: attacker, hitEntity: victim } = ev;
  if (!attacker || attacker.typeId !== "minecraft:player" || !victim) return;
  if (!isHoldingWeapon10(attacker)) return;
  withCooldown(attacker, "blaze_scimitar_input", INPUT_COOLDOWN_TICKS10, () => {
    const s = getState10(attacker);
    resetAttackingFlagIfNeeded(attacker, s);
    if (s.isAttacking) {
      bufferNextAttack(attacker, s, setState10, COMBO_CFG10);
      return;
    }
    s.emberAppliedThisSwing = false;
    startAttack(attacker, s, COMBO_CFG10, setState10);
  });
});
system13.runInterval(() => world10.getPlayers().forEach(safeTick(tickWeapon10)), 1);

// scripts/armory/echo/echo_maul.ts
import { world as world11, system as system14, EntityDamageCause as EntityDamageCause11 } from "@minecraft/server";
var WEAPON_ID11 = "resonance:echo_maul";
var BASE_DAMAGE11 = 13;
var INPUT_COOLDOWN_TICKS11 = 2;
var COMBO_RESET_TICKS11 = 45;
var ATTACK_LOCK_TICKS11 = 2;
var ANIM_CONTROLLER11 = "res:echo_maul_combo";
var PULSE_KNOCKBACK = 1.6;
var PULSE_KNOCKBACK_VERTICAL = 0.4;
var PULSE_SLOWNESS_TICKS = 25;
var BOOM_DAMAGE = 6;
var BOOM_RADIUS = 3;
var BOOM_DARKNESS_TICKS = 60;
var BOOM_COOLDOWN_TICKS = 50;
var ANIMS11 = [
  {
    animation: "animation.echo_maul.attack",
    attackTime: 23,
    nextAttackWindow: 6,
    cancelIntoNextTick: 23,
    hitFrames: [11, 12],
    range: 3.8,
    coneDeg: 70,
    damageMultiplier: 1
  },
  {
    animation: "animation.echo_maul.attack1",
    attackTime: 21,
    nextAttackWindow: 6,
    cancelIntoNextTick: 21,
    hitFrames: [10, 11],
    range: 3.8,
    coneDeg: 160,
    damageMultiplier: 1.1
  },
  {
    animation: "animation.echo_maul.attack2",
    attackTime: 27,
    nextAttackWindow: 8,
    cancelIntoNextTick: 27,
    hitFrames: [13, 14],
    range: 4,
    coneDeg: 360,
    damageMultiplier: 1.5
  }
];
var COMBO_CFG11 = {
  anims: ANIMS11,
  animController: ANIM_CONTROLLER11,
  inputCooldownTicks: INPUT_COOLDOWN_TICKS11,
  attackLockTicks: ATTACK_LOCK_TICKS11,
  comboResetTicks: COMBO_RESET_TICKS11
};
var STATE_KEY11 = "res_echo_maul_state";
var DEFAULT_STATE11 = {
  comboIndex: 0,
  isAttacking: false,
  frame: 0,
  bufferedNext: false,
  lockUntilTick: 0,
  lastAttackTick: 0,
  attackingFlagUntil: 0,
  inputLockUntilTick: 0,
  inputLocked: false,
  pulseFiredThisSwing: false
};
var getState11 = (p) => {
  const r = p.getDynamicProperty(STATE_KEY11);
  return r ? JSON.parse(r) : { ...DEFAULT_STATE11 };
};
var setState11 = (p, s) => p.setDynamicProperty(STATE_KEY11, JSON.stringify(s));
function isHoldingWeapon11(player) {
  const eq = player.getComponent("minecraft:equippable");
  return !!eq && eq.getEquipment?.("Mainhand")?.typeId === WEAPON_ID11;
}
var calcDamage11 = (anim) => Math.floor(BASE_DAMAGE11 * anim.damageMultiplier);
var applyHit11 = safeHit((player, target, dmg) => {
  dealDamage(target, dmg, { cause: EntityDamageCause11.entityAttack, damagingEntity: player });
  const dx = target.location.x - player.location.x;
  const dz = target.location.z - player.location.z;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  target.applyKnockback({ x: dx / len * PULSE_KNOCKBACK, z: dz / len * PULSE_KNOCKBACK }, PULSE_KNOCKBACK_VERTICAL);
  try {
    target.addEffect("slowness", PULSE_SLOWNESS_TICKS, { amplifier: 0, showParticles: false });
  } catch {
  }
});
function triggerSonicBoom(player) {
  withCooldown(player, "echo_maul_boom", BOOM_COOLDOWN_TICKS, () => {
    const dim = player.dimension;
    const center = player.location;
    const nearby = dim.getEntities({ location: center, maxDistance: BOOM_RADIUS, excludeTypes: NON_TARGET_TYPES }) || [];
    drawAreaRadius(player, center, BOOM_RADIUS);
    for (const e of nearby) {
      if (!e || e.id === player.id) continue;
      if (!e.getComponent?.("minecraft:health")) continue;
      if (e.getComponent("minecraft:tameable")?.tamedToPlayerId === player.id) continue;
      try {
        dealDamage(e, BOOM_DAMAGE, { cause: EntityDamageCause11.sonicBoom, damagingEntity: player });
        e.addEffect("darkness", BOOM_DARKNESS_TICKS, { amplifier: 0, showParticles: false });
      } catch {
      }
    }
    try {
      dim.spawnParticle("minecraft:sonic_explosion", { x: center.x, y: center.y + 1, z: center.z });
      dim.playSound("mob.warden.sonic_boom", center, { volume: 0.7, pitch: 1.3 });
      player.runCommand("execute as @s run camerashake add @s 0.5 0.4");
    } catch {
    }
  });
}
function tickWeapon11(player) {
  if (!isHoldingWeapon11(player)) return;
  const state = getState11(player);
  resetAttackingFlagIfNeeded(player, state);
  maintainOrReleaseInputLock(player, state);
  if (!state.isAttacking) {
    setState11(player, state);
    return;
  }
  const anim = ANIMS11[state.comboIndex % ANIMS11.length];
  const prevFrame = state.frame;
  state.frame++;
  if (prevFrame <= 0) state.pulseFiredThisSwing = false;
  if (anim.hitFrames.includes(state.frame)) {
    const targets = getTargetsInCone(player, anim.range, anim.coneDeg, 12);
    const dir = player.getViewDirection();
    attackStep(player, dir, anim, state);
    if (!state.pulseFiredThisSwing) {
      state.pulseFiredThisSwing = true;
      const dmg = calcDamage11(anim);
      for (const t of targets) applyHit11(player, t, dmg);
      try {
        player.dimension.playSound("mob.warden.attack", player.location, { volume: 0.5, pitch: 1.4 });
        player.dimension.playSound("random.anvil_land", player.location, { volume: 0.4, pitch: 0.6 });
        player.runCommand("execute as @s run camerashake add @s 0.3 0.3");
      } catch {
      }
      if (state.comboIndex % ANIMS11.length === 2) triggerSonicBoom(player);
    }
  }
  handleComboTransitionOrEnd(player, state, COMBO_CFG11, setState11);
}
onWeaponHit((ev) => {
  const { damagingEntity: attacker, hitEntity: victim } = ev;
  if (!attacker || attacker.typeId !== "minecraft:player" || !victim) return;
  if (!isHoldingWeapon11(attacker)) return;
  withCooldown(attacker, "echo_maul_input", INPUT_COOLDOWN_TICKS11, () => {
    const s = getState11(attacker);
    resetAttackingFlagIfNeeded(attacker, s);
    if (s.isAttacking) {
      bufferNextAttack(attacker, s, setState11, COMBO_CFG11);
      return;
    }
    s.pulseFiredThisSwing = false;
    startAttack(attacker, s, COMBO_CFG11, setState11);
  });
});
system14.runInterval(() => world11.getPlayers().forEach(safeTick(tickWeapon11)), 1);

// scripts/systems/hitbox_debug.ts
// Menu de opciones de la armeria + visualizacion de las hitbox de ataque.
// Los ajustes son por jugador (propiedad dinamica) y las particulas se envian
// solo al jugador que las activo (player.spawnParticle), asi no molesta a nadie.
import { ModalFormData, FormCancelationReason } from "@minecraft/server-ui";
import { system as systemDbg, world as worldDbg } from "@minecraft/server";
var SETTINGS_ITEM_ID = "resonance:armory_settings";
var SETTINGS_KEY = "res_armory_settings";
var SCRIPTEVENT_MENU_ID = "resonance:menu";
var HITBOX_COLORS = [
  { label: "Verde", particle: "minecraft:villager_happy" },
  { label: "Blanco (End Rod)", particle: "minecraft:endrod" },
  { label: "Fuego", particle: "minecraft:basic_flame_particle" },
  { label: "Azul (fuego de almas)", particle: "minecraft:blue_flame_particle" }
];
var HIT_MARKER_PARTICLE = "minecraft:villager_angry";
var AREA_PARTICLE = "minecraft:blue_flame_particle";
var MAX_CONE_HEIGHT = 2.5;
var DEFAULT_SETTINGS = {
  showHitbox: false,
  showHitMarkers: true,
  showAreaRadius: true,
  showHeightLimits: false,
  colorIndex: 0,
  density: 3
};
var settingsCache = /* @__PURE__ */ new Map();
function getArmorySettings(player) {
  const cached = settingsCache.get(player.id);
  if (cached) return cached;
  let s = { ...DEFAULT_SETTINGS };
  try {
    const raw = player.getDynamicProperty(SETTINGS_KEY);
    if (typeof raw === "string") s = { ...s, ...JSON.parse(raw) };
  } catch {
  }
  settingsCache.set(player.id, s);
  return s;
}
function saveArmorySettings(player, s) {
  settingsCache.set(player.id, s);
  try {
    player.setDynamicProperty(SETTINGS_KEY, JSON.stringify(s));
  } catch {
  }
}
function debugParticle(player, id, loc) {
  try {
    player.spawnParticle(id, loc);
  } catch {
    try {
      player.dimension.spawnParticle(id, loc);
    } catch {
    }
  }
}
// separacion entre particulas segun la densidad (1 = pocas, 5 = muchas)
var spacingFor = (s) => [0.9, 0.7, 0.5, 0.38, 0.28][Math.max(0, Math.min(4, (s.density ?? 3) - 1))];
// throttle: como mucho un dibujo de cono cada 2 ticks por jugador
var lastConeDraw = /* @__PURE__ */ new Map();
function drawAttackCone(player, range, coneDeg, targets) {
  const s = getArmorySettings(player);
  if (!s.showHitbox) return;
  const tick = systemDbg.currentTick;
  if (tick - (lastConeDraw.get(player.id) ?? -99) < 2) return;
  lastConeDraw.set(player.id, tick);
  const particle = (HITBOX_COLORS[s.colorIndex] ?? HITBOX_COLORS[0]).particle;
  const spacing = spacingFor(s);
  const o = player.location;
  const view = player.getViewDirection();
  const flatLen = Math.sqrt(view.x * view.x + view.z * view.z);
  const fx = flatLen > 1e-3 ? view.x / flatLen : 0;
  const fz = flatLen > 1e-3 ? view.z / flatLen : 1;
  const yaw = Math.atan2(fz, fx);
  const full = coneDeg >= 359;
  const half = Math.min(Math.PI, coneDeg * Math.PI / 180 / 2);
  const heights = s.showHeightLimits ? [0.15, MAX_CONE_HEIGHT, -MAX_CONE_HEIGHT + 0.15] : [0.15];
  for (const h of heights) {
    const y = o.y + h;
    // arco exterior (alcance maximo)
    const arcLen = range * half * 2;
    const arcSteps = Math.max(4, Math.ceil(arcLen / spacing));
    for (let i = 0; i <= arcSteps; i++) {
      const a = yaw - half + 2 * half * i / arcSteps;
      debugParticle(player, particle, { x: o.x + Math.cos(a) * range, y, z: o.z + Math.sin(a) * range });
    }
    if (full) continue;
    // bordes laterales del cono
    const radSteps = Math.max(2, Math.ceil(range / spacing));
    for (const a of [yaw - half, yaw + half]) {
      for (let i = 1; i < radSteps; i++) {
        const r = range * i / radSteps;
        debugParticle(player, particle, { x: o.x + Math.cos(a) * r, y, z: o.z + Math.sin(a) * r });
      }
    }
  }
  if (s.showHitMarkers) {
    for (const t of targets) {
      try {
        debugParticle(player, HIT_MARKER_PARTICLE, { x: t.location.x, y: t.location.y + 2.1, z: t.location.z });
      } catch {
      }
    }
  }
}
// Radio de habilidades en area (humo, descarga, campanada, brasas, boom...)
function drawAreaRadius(player, center, radius) {
  if (!player || player.typeId !== "minecraft:player") return;
  const s = getArmorySettings(player);
  if (!s.showHitbox || !s.showAreaRadius) return;
  const spacing = spacingFor(s);
  const steps = Math.max(8, Math.ceil(2 * Math.PI * radius / spacing));
  for (let i = 0; i < steps; i++) {
    const a = 2 * Math.PI * i / steps;
    debugParticle(player, AREA_PARTICLE, { x: center.x + Math.cos(a) * radius, y: center.y + 0.2, z: center.z + Math.sin(a) * radius });
  }
}
async function openArmoryMenu(player) {
  const s = getArmorySettings(player);
  const form = new ModalFormData().title("Resonance Armory - Opciones").toggle("Ver hitbox de ataque", { defaultValue: s.showHitbox, tooltip: "Dibuja con particulas el area (alcance y angulo) de cada golpe de las armas Resonance." }).toggle("Marcar enemigos alcanzados", { defaultValue: s.showHitMarkers }).toggle("Ver radio de habilidades en area", { defaultValue: s.showAreaRadius, tooltip: "Humo, descarga, campanada, explosion de brasas, sonic boom..." }).toggle("Ver limites de altura del golpe", { defaultValue: s.showHeightLimits, tooltip: "El golpe solo alcanza a entidades a menos de 2.5 bloques de altura de diferencia." }).dropdown("Color de la hitbox", HITBOX_COLORS.map((c) => c.label), { defaultValueIndex: s.colorIndex }).slider("Densidad de particulas", 1, 5, { defaultValue: s.density, valueStep: 1 });
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await form.show(player);
    if (res.canceled) {
      // con el chat abierto (p. ej. al usar /scriptevent) el formulario no se
      // puede mostrar todavia: se reintenta hasta que el jugador lo cierre
      if (res.cancelationReason === FormCancelationReason.UserBusy) {
        await new Promise((r) => systemDbg.runTimeout(r, 5));
        continue;
      }
      return;
    }
    const [showHitbox, showHitMarkers, showAreaRadius, showHeightLimits, colorIndex, density] = res.formValues ?? [];
    saveArmorySettings(player, {
      showHitbox: !!showHitbox,
      showHitMarkers: !!showHitMarkers,
      showAreaRadius: !!showAreaRadius,
      showHeightLimits: !!showHeightLimits,
      colorIndex: typeof colorIndex === "number" ? colorIndex : 0,
      density: typeof density === "number" ? density : 3
    });
    try {
      player.sendMessage(showHitbox ? "\xA7a[Resonance] Hitbox de ataque: ACTIVADA" : "\xA77[Resonance] Hitbox de ataque: desactivada");
    } catch {
    }
    return;
  }
}
function tryOpenMenu(player) {
  openArmoryMenu(player).catch((e) => console.warn(`[Resonance] menu: ${e}`));
}
// 1) objeto "Opciones de la Armeria": click derecho
worldDbg.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (!source || source.typeId !== "minecraft:player" || !itemStack) return;
  if (itemStack.typeId === SETTINGS_ITEM_ID) tryOpenMenu(source);
});
// 2) comando: /scriptevent resonance:menu
systemDbg.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== SCRIPTEVENT_MENU_ID) return;
  const p = ev.sourceEntity;
  if (p && p.typeId === "minecraft:player") tryOpenMenu(p);
});
worldDbg.afterEvents.playerLeave.subscribe(({ playerId }) => {
  settingsCache.delete(playerId);
  lastConeDraw.delete(playerId);
});

// scripts/systems/session.ts
var ALL_STATE_KEYS = [STATE_KEY, STATE_KEY2, STATE_KEY3, STATE_KEY4, STATE_KEY5, STATE_KEY6, STATE_KEY7, STATE_KEY8, STATE_KEY9, STATE_KEY10, STATE_KEY11];
function resetPlayerCombatState(player) {
  for (const key of ALL_STATE_KEYS) {
    try {
      player.setDynamicProperty(key, void 0);
    } catch {
    }
  }
  try {
    player.setDynamicProperty(ATTACKING_FLAG, 0);
  } catch {
  }
  clearCooldowns(player);
  activeInputLocks.delete(player.id);
  enableMovement(player);
}
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn) resetPlayerCombatState(player);
});
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  activeInputLocks.delete(playerId);
  const prefix = `${playerId}:`;
  for (const k of [...cooldowns.keys()]) if (k.startsWith(prefix)) cooldowns.delete(k);
});
system.runInterval(releaseExpiredInputLocks, 1);

