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
    attackTime: 15,
    nextAttackWindow: 4,
    cancelIntoNextTick: 9,
    hitFrames: [6, 7],
    range: 4.2,
    coneDeg: 40,
    damageMultiplier: 1
  },
  {
    animation: "animation.amethyst_glaive.attack1",
    attackTime: 17,
    nextAttackWindow: 4,
    cancelIntoNextTick: 11,
    hitFrames: [7, 8],
    range: 3.8,
    coneDeg: 150,
    damageMultiplier: 1.1
  },
  {
    animation: "animation.amethyst_glaive.attack2",
    attackTime: 20,
    nextAttackWindow: 6,
    cancelIntoNextTick: 13,
    hitFrames: [9, 10],
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
    player.applyKnockback({ x: dir.x, z: dir.z }, 0);
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
      bufferNextAttack(attacker, s, setState9);
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
    cancelIntoNextTick: 8,
    hitFrames: [5, 6],
    range: 3,
    coneDeg: 90,
    damageMultiplier: 1
  },
  {
    animation: "animation.blaze_scimitar.attack1",
    attackTime: 13,
    nextAttackWindow: 3,
    cancelIntoNextTick: 8,
    hitFrames: [5, 6],
    range: 3,
    coneDeg: 90,
    damageMultiplier: 1.1
  },
  {
    animation: "animation.blaze_scimitar.attack2",
    attackTime: 18,
    nextAttackWindow: 5,
    cancelIntoNextTick: 12,
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
    player.applyKnockback({ x: dir.x, z: dir.z }, 0);
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
      bufferNextAttack(attacker, s, setState10);
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
    attackTime: 22,
    nextAttackWindow: 6,
    cancelIntoNextTick: 14,
    hitFrames: [10, 11],
    range: 3.8,
    coneDeg: 70,
    damageMultiplier: 1
  },
  {
    animation: "animation.echo_maul.attack1",
    attackTime: 20,
    nextAttackWindow: 6,
    cancelIntoNextTick: 13,
    hitFrames: [9, 10],
    range: 3.8,
    coneDeg: 160,
    damageMultiplier: 1.1
  },
  {
    animation: "animation.echo_maul.attack2",
    attackTime: 26,
    nextAttackWindow: 8,
    cancelIntoNextTick: 17,
    hitFrames: [12, 13],
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
    player.applyKnockback({ x: dir.x * 0.6, z: dir.z * 0.6 }, 0);
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
      bufferNextAttack(attacker, s, setState11);
      return;
    }
    s.pulseFiredThisSwing = false;
    startAttack(attacker, s, COMBO_CFG11, setState11);
  });
});
system14.runInterval(() => world11.getPlayers().forEach(safeTick(tickWeapon11)), 1);

