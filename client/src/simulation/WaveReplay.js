/**
 * WaveReplay — animates a wave whose outcome is known exactly from on-chain data.
 *
 * Receives `enemyOutcomes` — a bitmask where bit i = 1 if the i-th spawned
 * enemy was killed (spawn order: TJ group, CO group, HS group, Boss group).
 * Each enemy independently knows its fate, so the animation faithfully mirrors
 * the contract's per-enemy simulation rather than group-level approximations.
 *
 * New features mirrored from the contract:
 *   - Wave modifier (Fast/Armored) applied to all enemies
 *   - Per-enemy traits (Armored/Fast) on selected spawn indices (wave ≥ 5)
 *   - Boss enemy group (waves 5, 10)
 *   - Tower level damage multiplier (levels 1-3)
 *   - Tower synergy bonus (+20% damage for adjacent towers of different types)
 *   - Overclock ability (halves all tower cooldowns for this wave)
 */

import {
  BASE_X, BASE_Y,
  ENEMIES,
  FACTORIES,
  getTokenTier,
  PATH_WAYPOINTS,
  TOKEN_NAMES,
  TOWER_RANGE,
  TOWER_RANGE_SQ,
  VISION_RANGE_SQ,
  CODE_AOE_MULT_X100,
  TOWERS,
  WAVE_COMPOSITIONS,
  getWaveModifier,
  getEnemyTrait,
  getTowerLevelMultiplier,
  // Contract-exact simulation helpers
  countPathCellsCovered,
  computeShots,
  getTokenTierIndex,
  TIER_DMG_MULT_X100,
  TIER_COOLDOWN_X100,
  towerDamageMultX100,
} from '../constants.js';

let _nextId = 0;
const uid = () => ++_nextId;

const PROJECTILE_COLORS = ['#4CAF50', '#CE93D8', '#FFC107'];

// ── Path geometry ─────────────────────────────────────────────────────────────

const PATH_SEGMENTS = (() => {
  const segs = [];
  for (let i = 1; i < PATH_WAYPOINTS.length; i++) {
    const a = PATH_WAYPOINTS[i - 1];
    const b = PATH_WAYPOINTS[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    segs.push({ from: a, to: b, length: Math.sqrt(dx * dx + dy * dy) });
  }
  return segs;
})();

const TOTAL_PATH_LENGTH = PATH_SEGMENTS.reduce((s, seg) => s + seg.length, 0);

/** Cartesian position at fractional path progress 0-1. */
function posAtProgress(progress) {
  const target = Math.min(progress, 1) * TOTAL_PATH_LENGTH;
  let dist = 0;
  for (const seg of PATH_SEGMENTS) {
    if (dist + seg.length >= target) {
      const t = (target - dist) / seg.length;
      return {
        x: seg.from.x + t * (seg.to.x - seg.from.x),
        y: seg.from.y + t * (seg.to.y - seg.from.y),
      };
    }
    dist += seg.length;
  }
  return { ...PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1] };
}

/**
 * Compute the path progress at which the last tower can no longer cover an enemy.
 * This is the global latest kill point across all towers.
 */
function computeKillProgress(towers) {
  let maxProgress = 0.30;
  for (const tower of towers) {
    const tx = Number(tower.x) + 0.5;
    const ty = Number(tower.y) + 0.5;
    const tRange = Number(tower.tower_type) === 1 ? Math.sqrt(VISION_RANGE_SQ) : TOWER_RANGE;
    for (let s = 0; s <= 200; s++) {
      const p = s / 200;
      const pos = posAtProgress(p);
      const dx = pos.x - tx;
      const dy = pos.y - ty;
      if (Math.sqrt(dx * dx + dy * dy) <= tRange) {
        if (p > maxProgress) maxProgress = p;
      }
    }
  }
  return Math.min(maxProgress + 0.04, 0.88);
}

/**
 * Compute the path progress at which enemies first enter any tower's range.
 * Used as the start of the "kill zone" for per-enemy kill progress interpolation.
 */
function computeEntryProgress(towers) {
  let minProgress = 0.15;
  for (const tower of towers) {
    const tx = Number(tower.x) + 0.5;
    const ty = Number(tower.y) + 0.5;
    const tRange = Number(tower.tower_type) === 1 ? Math.sqrt(VISION_RANGE_SQ) : TOWER_RANGE;
    for (let s = 0; s <= 200; s++) {
      const p = s / 200;
      const pos = posAtProgress(p);
      const dx = pos.x - tx;
      const dy = pos.y - ty;
      if (Math.sqrt(dx * dx + dy * dy) <= tRange) {
        if (p < minProgress) minProgress = p;
        break; // found first entry for this tower
      }
    }
  }
  return Math.max(0.02, minProgress);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build spawn queue. Mirrors the contract's spawn order exactly:
 * TJ group → CO group → HS group → Boss group.
 * Each entry carries enemyIndex (global), group (0-3), and indexInGroup
 * for modifier and trait lookups.
 */
function buildSpawnQueue(waveNumber) {
  const composition = WAVE_COMPOSITIONS[waveNumber] ?? WAVE_COMPOSITIONS[10];
  const queue = [];
  let delay = 0;
  let enemyIndex = 0;
  let groupIndex = 0;
  for (const group of composition) {
    for (let i = 0; i < group.count; i++) {
      queue.push({ type: group.type, delay, enemyIndex, group: groupIndex, indexInGroup: i });
      // Boss spawns alone with a longer gap; others at 0.55s intervals
      delay += group.type === 'Boss' ? 0 : 0.55;
      enemyIndex++;
    }
    delay += 1.2;
    groupIndex++;
  }
  return queue;
}

function computeMaxTokens(factories, gameState) {
  const tokens = {
    input_tokens: Number(gameState.input_tokens ?? 0),
    image_tokens:  Number(gameState.image_tokens  ?? 0),
    code_tokens:   Number(gameState.code_tokens   ?? 0),
  };
  for (const f of factories) {
    if (f.is_active === false) continue;
    const def = FACTORIES[Number(f.factory_type)];
    if (!def) continue;
    const output = Math.floor(def.baseOutput * (1 + 0.5 * (Number(f.level) - 1)));
    tokens[def.tokenType] = (tokens[def.tokenType] ?? 0) + output;
  }
  // Mirror contract cap: MAX_TOKEN_BALANCE = 150
  const CAP = 150;
  for (const key of Object.keys(tokens)) {
    if (tokens[key] > CAP) tokens[key] = CAP;
  }
  return tokens;
}

// ── WaveReplay class ──────────────────────────────────────────────────────────

export class WaveReplay {
  /**
   * @param {object} opts
   * @param {unknown[]} opts.towers           - confirmed tower entities
   * @param {unknown[]} opts.factories        - confirmed factory entities
   * @param {object}    opts.gameState        - PRE-wave on-chain GameState
   * @param {number}    opts.waveNumber       - 1-based wave number resolving
   * @param {number}    opts.enemyOutcomes    - bitmask: bit i=1 if enemy i killed
   * @param {number}    opts.baseDamageTaken  - total base damage (from event)
   */
  constructor({ towers, factories, gameState, waveNumber, enemyOutcomes, baseDamageTaken }) {
    this._enemyOutcomes = enemyOutcomes >>> 0; // treat as unsigned 32-bit
    this._waveNumber    = waveNumber;
    this._waveModifier  = getWaveModifier(waveNumber); // 0=None,1=Fast,2=Armored
    this._overclockActive = !!(gameState?.overclock_used);

    // Base health starts at PRE-wave value; drains as enemies arrive.
    this.baseHealth      = Number(gameState.base_health ?? 20);
    this._baseDamageLeft = Math.max(0, baseDamageTaken);

    // Tokens: start from pre-wave amounts + this wave's production (visual only).
    this.maxTokens = computeMaxTokens(factories, gameState);
    this.tokens    = { ...this.maxTokens };

    // Towers
    this.towers = towers
      .filter((t) => t.is_alive !== false)
      .map((t) => ({
        ...t,
        health:       Number(t.health),
        level:        Number(t.level) || 1,
        target:       null,
        fireCooldown: 0,
        attackFlash:  0,
      }));

    // Kill zone: global entry/exit progress for tower coverage
    this._killProgress  = this.towers.length > 0 ? computeKillProgress(this.towers)  : 0.65;
    this._entryProgress = this.towers.length > 0 ? computeEntryProgress(this.towers) : 0.10;

    // Spawn queue — snapshot saved for pre-computation before it is consumed
    this.spawnQueue          = buildSpawnQueue(waveNumber);
    this._spawnQueueSnapshot = [...this.spawnQueue];
    this.spawnTimer          = 0;
    this.enemies             = [];
    this._allSpawned         = false;

    // Pre-computation: run exact contract simulation to get per-enemy data
    this._enemyDataMap = this._precomputeEnemyData();

    // Visual effects
    this.projectiles   = [];
    this.particles     = [];
    this.floatingTexts = [];
    this._screenShakePulse = 0;

    this.done = false;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  step(dt) {
    if (this.done) return this._snapshot();

    this._processSpawns(dt);

    for (const e of this.enemies) {
      if (!e.alive) continue;
      this._moveEnemy(e, dt);
    }

    this._tickTowers(dt);
    this._advanceProjectiles(dt);
    this._advanceTexts(dt);
    this._advanceParticles(dt);

    for (const e of this.enemies) {
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
    }

    if (this._allSpawned && !this.enemies.some((e) => e.alive)) {
      this.done = true;
    }

    return this._snapshot();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Runs the exact contract simulation (resolve_wave / process_enemy) as a
   * pre-computation pass before animation starts.
   *
   * Mirrors the contract exactly:
   *   - Sequential enemy processing (token state carries over between enemies)
   *   - Integer HP / speed modifiers (floor division, matching Cairo)
   *   - Discrete shot computation (computeShots)
   *   - Token tier from cur/max token state at processing time
   *
   * Returns Map<enemyIndex, {hp, spdX100, totalDamage, killed,
   *   tokens_before, tokens_consumed, killProgress, maxVisualDamage}>
   */
  _precomputeEnemyData() {
    const result = new Map();

    // Start from maxTokens (= pre-wave balances + this wave's production, capped)
    let curInput = this.maxTokens.input_tokens;
    let curImage = this.maxTokens.image_tokens;
    let curCode  = this.maxTokens.code_tokens;

    for (const entry of this._spawnQueueSnapshot) {
      const { type, enemyIndex, group, indexInGroup } = entry;
      const def = ENEMIES[type] ?? ENEMIES['TextJailbreak'];
      const isSwarm = type === 'HalluSwarm';

      // Base stats as integer ×100 for speed — mirrors contract constants
      const baseSpdX100 = Math.round(def.speed * 100);

      // Apply wave modifier using integer arithmetic (mirrors apply_modifier_*)
      let hp      = def.hp;
      let spdX100 = baseSpdX100;
      if (this._waveModifier === 2) hp      = hp      + Math.floor(hp      / 2); // Armored
      if (this._waveModifier === 1) spdX100 = spdX100 + Math.floor(spdX100 / 2); // Fast

      // Apply per-enemy trait (non-boss, wave ≥ 5)
      if (type !== 'Boss') {
        const trait = getEnemyTrait(this._waveNumber, group, indexInGroup);
        if (trait === 1) hp      = hp      + Math.floor(hp      / 2); // Armored trait
        if (trait === 2) spdX100 = spdX100 + Math.floor(spdX100 / 2); // Fast trait
      }

      // Process all towers against this enemy — mirrors contract process_enemy
      let totalDmg = 0;
      let conInput = 0, conImage = 0, conCode = 0;

      for (const tower of this.towers) {
        const ttype   = Number(tower.tower_type);
        // Vision towers have reduced range — mirrors contract VISION_RANGE_SQ
        const rangeSq = ttype === 1 ? VISION_RANGE_SQ : TOWER_RANGE_SQ;
        const covered = countPathCellsCovered(Number(tower.x), Number(tower.y), rangeSq);
        if (covered === 0) continue;

        const curTok = ttype === 0 ? curInput : ttype === 1 ? curImage : curCode;
        const maxTok = ttype === 0 ? this.maxTokens.input_tokens
                     : ttype === 1 ? this.maxTokens.image_tokens
                     :               this.maxTokens.code_tokens;

        const tier       = getTokenTierIndex(curTok, maxTok);
        let   dmgMult    = TIER_DMG_MULT_X100[tier] ?? 15;
        const cooldown   = TIER_COOLDOWN_X100[tier] ?? 450;
        const effCooldown = this._overclockActive ? Math.ceil(cooldown / 2) : cooldown;

        if (this._hasSynergyNeighbor(tower)) dmgMult += 20; // synergy +20%

        const levelMult = towerDamageMultX100(Number(tower.level));
        const baseDmg   = TOWERS[ttype]?.damage ?? 10;
        const shots     = computeShots(covered, spdX100, effCooldown);

        // Mirrors: shots * base_dmg * eff_dmg_mult * level_mult / 10000
        const baseTowerDmg = Math.floor(shots * baseDmg * dmgMult * levelMult / 10000);
        // Code tower AoE bonus vs HalluSwarm: 1.5× (mirrors CODE_AOE_MULT_X100 = 150)
        const aoeMult = (isSwarm && ttype === 2) ? CODE_AOE_MULT_X100 : 100;
        const towerDmg = Math.floor(baseTowerDmg * aoeMult / 100);
        totalDmg += towerDmg;

        const consumed = shots * 2; // TOKEN_COST_PER_SHOT = 2
        if (ttype === 0) conInput += consumed;
        else if (ttype === 1) conImage += consumed;
        else conCode += consumed;
      }

      const killed = !!((this._enemyOutcomes >>> enemyIndex) & 1);

      // Per-enemy kill progress: how far into the tower zone before death
      // Fraction = hp / totalDamage → fraction=1 means barely killed (late death),
      //   fraction<1 means overkill (early death), fraction>1 means survivor
      let killProgress;
      let maxVisualDamage;
      if (killed && totalDmg > 0) {
        const fraction  = Math.min(1.0, hp / totalDmg);
        killProgress    = this._entryProgress + (this._killProgress - this._entryProgress) * fraction;
        killProgress    = Math.min(0.91, Math.max(this._entryProgress + 0.02, killProgress));
        maxVisualDamage = hp; // killed enemies fully drain
      } else {
        killProgress    = 2.0; // unreachable — survivor never triggers kill
        maxVisualDamage = Math.max(0, Math.min(hp - 1, totalDmg)); // show partial damage
      }

      result.set(enemyIndex, {
        hp,
        spdX100,
        totalDamage: totalDmg,
        killed,
        tokens_before:    { input: curInput, image: curImage, code: curCode },
        tokens_consumed:  { input: conInput, image: conImage, code: conCode },
        killProgress,
        maxVisualDamage,
      });

      // Carry over drained tokens to next enemy (sequential model)
      curInput = Math.max(0, curInput - conInput);
      curImage = Math.max(0, curImage - conImage);
      curCode  = Math.max(0, curCode  - conCode);
    }

    return result;
  }

  _processSpawns(dt) {
    if (this._allSpawned) return;
    this.spawnTimer += dt;
    let i = 0;
    while (i < this.spawnQueue.length) {
      if (this.spawnTimer >= this.spawnQueue[i].delay) {
        const { type, enemyIndex, group, indexInGroup } = this.spawnQueue[i];
        this.enemies.push(this._buildEnemy(type, enemyIndex, group, indexInGroup));
        this.spawnQueue.splice(i, 1);
      } else {
        i++;
      }
    }
    if (this.spawnQueue.length === 0) this._allSpawned = true;
  }

  _buildEnemy(type, enemyIndex, group, indexInGroup) {
    const def  = ENEMIES[type] ?? ENEMIES['TextJailbreak'];
    const wp0  = PATH_WAYPOINTS[0];
    const data = this._enemyDataMap.get(enemyIndex);

    // Use precomputed HP / speed (contract-exact integer arithmetic).
    // Fallback to float approximation if precomputation is missing.
    let hp, speed;
    if (data) {
      hp    = data.hp;
      speed = data.spdX100 / 100;
    } else {
      hp    = def.hp;
      speed = def.speed;
      if (this._waveModifier === 2) hp    = Math.floor(hp    * 1.5);
      if (this._waveModifier === 1) speed = speed * 1.5;
      if (type !== 'Boss') {
        const trait = getEnemyTrait(this._waveNumber, group, indexInGroup);
        if (trait === 1) hp    = Math.floor(hp    * 1.5);
        if (trait === 2) speed = speed * 1.5;
      }
    }

    const killed          = data ? data.killed : !!((this._enemyOutcomes >>> enemyIndex) & 1);
    const killProgress    = data ? data.killProgress    : this._killProgress;
    const maxVisualDamage = data ? data.maxVisualDamage : (killed ? hp : Math.floor(hp * 0.7));

    return {
      id:             uid(),
      type,
      enemyIndex,
      group,
      indexInGroup,
      killed,
      x:              wp0.x,
      y:              wp0.y,
      waypointIndex:  1,
      pathProgress:   0,
      hp,
      maxHp:          hp,
      speed,
      gold:           def.gold,
      alive:          true,
      hitFlash:       0,
      killProgress,       // per-enemy: where on the path they die
      maxVisualDamage,    // per-enemy: max visual damage shown (hp-1 for survivors)
      damageTaken:    0,  // tracks visual damage so we can cap survivors
    };
  }

  _moveEnemy(enemy, dt) {
    // Update fractional path progress for kill-point tracking.
    enemy.pathProgress += (enemy.speed * dt) / TOTAL_PATH_LENGTH;

    // Killed enemy: die when HP drained OR force-kill when reaching computed kill point.
    // The force-kill handles cases where continuous fire rate underestimates discrete shots.
    if (enemy.killed) {
      if (enemy.hp <= 0 || enemy.pathProgress >= enemy.killProgress) {
        this._killEnemy(enemy);
        return;
      }
    }

    // Waypoint movement.
    if (enemy.waypointIndex >= PATH_WAYPOINTS.length) {
      this._reachBase(enemy);
      return;
    }

    const target = PATH_WAYPOINTS[enemy.waypointIndex];
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = enemy.speed * dt;

    if (step >= dist) {
      enemy.x = target.x;
      enemy.y = target.y;
      enemy.waypointIndex++;
    } else {
      enemy.x += (dx / dist) * step;
      enemy.y += (dy / dist) * step;
    }
  }

  _tickTowers(dt) {
    for (const tower of this.towers) {
      if (!tower.is_alive) continue;
      if (tower.attackFlash > 0) tower.attackFlash = Math.max(0, tower.attackFlash - dt);
      tower.fireCooldown -= dt;
      if (tower.fireCooldown > 0) continue;

      const tDef     = TOWERS[Number(tower.tower_type)];
      const tokenKey = TOKEN_NAMES[tDef.tokenType];
      const tier     = getTokenTier(this.tokens[tokenKey] ?? 0, this.maxTokens[tokenKey] ?? 1);

      // Drain tokens visually.
      if ((this.tokens[tokenKey] ?? 0) >= tDef.tokenCost) {
        this.tokens[tokenKey] -= tDef.tokenCost;
      }

      // Overclock: halve cooldown (doubles fire rate).
      tower.fireCooldown = this._overclockActive ? tier.cooldown / 2 : tier.cooldown;

      const target = this._nearestEnemy(tower);
      if (!target) continue;

      // Projectile
      const tx = Number(tower.x) + 0.5;
      const ty = Number(tower.y) + 0.5;
      this.projectiles.push({
        id: uid(), fromX: tx, fromY: ty,
        toX: target.x, toY: target.y,
        progress: 0, duration: 0.13,
        color: PROJECTILE_COLORS[Number(tower.tower_type)] ?? '#fff',
      });
      tower.attackFlash = 0.18;

      // Deal damage to all enemies in range.
      // Killed enemies: full damage until HP reaches 0.
      // Survivors: show partial damage up to their precomputed maxVisualDamage (capped at hp-1).
      {
        const levelMult   = getTowerLevelMultiplier(tower.level);
        const synergyMult = this._hasSynergyNeighbor(tower) ? 1.2 : 1.0;
        const damage = Math.round(tDef.damage * tier.dmgMultiplier * levelMult * synergyMult);

        if (target.killed) {
          target.hp        -= damage;
          target.damageTaken += damage;
          target.hitFlash   = 0.1;
          this.floatingTexts.push({
            id: uid(), x: target.x, y: target.y - 0.5,
            text: `-${damage}`, color: '#EF5350',
            age: 0, maxAge: 0.65,
          });
        } else if (target.damageTaken < target.maxVisualDamage) {
          // Survivor: show how much fire the contract actually dealt, but cap at hp-1
          const visualDmg    = Math.min(damage, target.maxVisualDamage - target.damageTaken);
          target.hp          = Math.max(1, target.hp - visualDmg);
          target.damageTaken += visualDmg;
          target.hitFlash    = 0.08;
          if (visualDmg > 0) {
            this.floatingTexts.push({
              id: uid(), x: target.x, y: target.y - 0.5,
              text: `-${visualDmg}`, color: '#FF8A65',
              age: 0, maxAge: 0.5,
            });
          }
        }
      }
    }
  }

  _nearestEnemy(tower) {
    let best = null, bestDist = Infinity;
    const tx = Number(tower.x) + 0.5;
    const ty = Number(tower.y) + 0.5;
    const tRange = Number(tower.tower_type) === 1 ? Math.sqrt(VISION_RANGE_SQ) : TOWER_RANGE;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - tx, dy = e.y - ty;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= tRange && dist < bestDist) { bestDist = dist; best = e; }
    }
    return best;
  }

  /** Returns true if the tower has an adjacent (Manhattan dist=1) alive tower of a different type. */
  _hasSynergyNeighbor(tower) {
    const tx    = Number(tower.x);
    const ty    = Number(tower.y);
    const ttype = Number(tower.tower_type);
    return this.towers.some((t) => {
      if (t === tower || !t.is_alive) return false;
      if (Number(t.tower_type) === ttype) return false;
      const dx = Math.abs(Number(t.x) - tx);
      const dy = Math.abs(Number(t.y) - ty);
      return dx + dy === 1;
    });
  }

  _killEnemy(enemy) {
    enemy.alive = false;

    const particleCount = enemy.type === 'Boss' ? 14 : 7;
    for (let p = 0; p < particleCount; p++) {
      const angle = (p / particleCount) * Math.PI * 2;
      this.particles.push({
        id: uid(), x: enemy.x, y: enemy.y,
        vx: Math.cos(angle) * (1.2 + Math.random() * 0.8),
        vy: Math.sin(angle) * (1.2 + Math.random() * 0.8),
        color: enemy.type === 'Boss' ? '#9B59B6' : '#FFA726',
        age: 0, maxAge: 0.45 + Math.random() * 0.15,
      });
    }
    this.floatingTexts.push({
      id: uid(), x: enemy.x + 0.3, y: enemy.y - 1.0,
      text: `+${enemy.gold}g`, color: '#FFD600',
      age: 0, maxAge: 0.9,
    });
  }

  _reachBase(enemy) {
    enemy.alive = false;

    const def = ENEMIES[enemy.type];
    const dmg = Math.min(def?.damage ?? 1, this._baseDamageLeft);
    this._baseDamageLeft = Math.max(0, this._baseDamageLeft - dmg);
    this.baseHealth      = Math.max(0, this.baseHealth - dmg);
    this._screenShakePulse++;

    if (dmg > 0) {
      this.floatingTexts.push({
        id: uid(), x: BASE_X + 0.5, y: BASE_Y - 0.4,
        text: `-${dmg}`, color: '#F44336',
        age: 0, maxAge: 0.9,
      });
    }
    const particleCount = enemy.type === 'Boss' ? 10 : 5;
    for (let p = 0; p < particleCount; p++) {
      const angle = (p / particleCount) * Math.PI * 2;
      this.particles.push({
        id: uid(), x: BASE_X + 0.5, y: BASE_Y + 0.5,
        vx: Math.cos(angle) * 0.8, vy: Math.sin(angle) * 0.8,
        color: '#F44336', age: 0, maxAge: 0.4,
      });
    }
  }

  _advanceProjectiles(dt) {
    this.projectiles = this.projectiles.filter((p) => {
      p.progress += dt / p.duration;
      return p.progress < 1;
    });
  }

  _advanceTexts(dt) {
    this.floatingTexts = this.floatingTexts.filter((t) => {
      t.age += dt;
      t.y   -= 0.55 * dt;
      return t.age < t.maxAge;
    });
  }

  _advanceParticles(dt) {
    this.particles = this.particles.filter((p) => {
      p.age += dt;
      p.x   += p.vx * dt;
      p.y   += p.vy * dt;
      return p.age < p.maxAge;
    });
  }

  _snapshot() {
    return {
      done:             this.done,
      enemies:          this.enemies.map((e) => ({ ...e })),
      towers:           this.towers.map((t) => ({ ...t })),
      tokens:           { ...this.tokens },
      maxTokens:        { ...this.maxTokens },
      projectiles:      [...this.projectiles],
      particles:        [...this.particles],
      floatingTexts:    [...this.floatingTexts],
      screenShakePulse: this._screenShakePulse,
      baseHealth:       this.baseHealth,
    };
  }
}
