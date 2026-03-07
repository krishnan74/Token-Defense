/**
 * WaveReplay — animates a wave whose outcome is already known from on-chain data.
 *
 * Instead of computing damage and letting the physics decide who dies, we receive
 * `killedTJ/CO/HS` booleans derived from the on-chain kill-gold and replay
 * the animation so it visually matches the chain result:
 *   - Killed groups: enemies take damage from towers and die before reaching base.
 *   - Surviving groups: enemies ignore tower hits and march to the base.
 */

import {
  BASE_X, BASE_Y,
  ENEMIES,
  FACTORIES,
  getTokenTier,
  PATH_WAYPOINTS,
  TOKEN_NAMES,
  TOWER_RANGE,
  TOWERS,
  WAVE_COMPOSITIONS,
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
 * Compute the path progress (0-1) at which a tower can no longer cover an enemy
 * marching along the path.  We sample the path in fine steps and keep the last
 * point within TOWER_RANGE of any placed tower.  Enemies of killed groups will
 * die at (or shortly past) this point, giving the visual impression that the
 * last tower in their lane finished them off.
 */
function computeKillProgress(towers) {
  let maxProgress = 0.30;
  for (const tower of towers) {
    const tx = Number(tower.x) + 0.5;
    const ty = Number(tower.y) + 0.5;
    for (let s = 0; s <= 200; s++) {
      const p = s / 200;
      const pos = posAtProgress(p);
      const dx = pos.x - tx;
      const dy = pos.y - ty;
      if (Math.sqrt(dx * dx + dy * dy) <= TOWER_RANGE) {
        if (p > maxProgress) maxProgress = p;
      }
    }
  }
  return Math.min(maxProgress + 0.04, 0.88);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSpawnQueue(waveNumber) {
  const composition = WAVE_COMPOSITIONS[waveNumber] ?? WAVE_COMPOSITIONS[10];
  const queue = [];
  let delay = 0;
  for (const group of composition) {
    for (let i = 0; i < group.count; i++) {
      queue.push({ type: group.type, delay });
      delay += 0.55;
    }
    delay += 1.2;
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
  return tokens;
}

// ── WaveReplay class ──────────────────────────────────────────────────────────

export class WaveReplay {
  /**
   * @param {object} opts
   * @param {unknown[]} opts.towers        - confirmed tower entities
   * @param {unknown[]} opts.factories     - confirmed factory entities
   * @param {object}    opts.gameState     - PRE-wave on-chain GameState
   * @param {number}    opts.waveNumber    - 1-based wave number (the one resolving)
   * @param {boolean}   opts.killedTJ      - were all TextJailbreaks killed?
   * @param {boolean}   opts.killedCO      - were all ContextOverflows killed?
   * @param {boolean}   opts.killedHS      - were all HalluSwarms killed?
   * @param {number}    opts.baseDamageTaken - total base damage from chain diff
   */
  constructor({ towers, factories, gameState, waveNumber, killedTJ, killedCO, killedHS, baseDamageTaken }) {
    this.killedByType = {
      TextJailbreak:   killedTJ,
      ContextOverflow: killedCO,
      HalluSwarm:      killedHS,
    };

    // Base health starts at PRE-wave value; we'll drain it as enemies arrive.
    this.baseHealth        = Number(gameState.base_health ?? 20);
    this._baseDamageLeft   = Math.max(0, baseDamageTaken);

    // Tokens: start from pre-wave amounts + this wave's production (visual only).
    this.maxTokens = computeMaxTokens(factories, gameState);
    this.tokens    = { ...this.maxTokens };

    // Towers
    this.towers = towers
      .filter((t) => t.is_alive !== false)
      .map((t) => ({
        ...t,
        health:       Number(t.health),
        target:       null,
        fireCooldown: 0,
        attackFlash:  0,
      }));

    // Kill point: path progress at which killed enemies die.
    this._killProgress = this.towers.length > 0
      ? computeKillProgress(this.towers)
      : 0.65;

    // Spawn queue
    this.spawnQueue   = buildSpawnQueue(waveNumber);
    this.spawnTimer   = 0;
    this.enemies      = [];
    this._allSpawned  = false;

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

  _processSpawns(dt) {
    if (this._allSpawned) return;
    this.spawnTimer += dt;
    let i = 0;
    while (i < this.spawnQueue.length) {
      if (this.spawnTimer >= this.spawnQueue[i].delay) {
        this.enemies.push(this._buildEnemy(this.spawnQueue[i].type));
        this.spawnQueue.splice(i, 1);
      } else {
        i++;
      }
    }
    if (this.spawnQueue.length === 0) this._allSpawned = true;
  }

  _buildEnemy(type) {
    const def = ENEMIES[type];
    const wp0 = PATH_WAYPOINTS[0];
    return {
      id:            uid(),
      type,
      x:             wp0.x,
      y:             wp0.y,
      waypointIndex: 1,
      pathProgress:  0,
      hp:            def.hp,
      maxHp:         def.hp,
      speed:         def.speed,
      gold:          def.gold,
      alive:         true,
      hitFlash:      0,
    };
  }

  _moveEnemy(enemy, dt) {
    const killed = this.killedByType[enemy.type];

    // Update fractional path progress for kill-point tracking.
    enemy.pathProgress += (enemy.speed * dt) / TOTAL_PATH_LENGTH;

    // Killed enemy has been reduced to 0 hp AND reached kill point — die.
    if (killed && enemy.hp <= 0) {
      this._killEnemy(enemy);
      return;
    }

    // Waypoint movement (same as WaveSimulator).
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
      tower.fireCooldown = tier.cooldown;

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

      // Only actually damage enemies whose type is killed.
      // Survivors are immune — they march through regardless.
      if (this.killedByType[target.type]) {
        const damage = Math.round(tDef.damage * tier.dmgMultiplier);
        target.hp      -= damage;
        target.hitFlash = 0.1;

        this.floatingTexts.push({
          id: uid(), x: target.x, y: target.y - 0.5,
          text: `-${damage}`, color: '#EF5350',
          age: 0, maxAge: 0.65,
        });
      }
    }
  }

  _nearestEnemy(tower) {
    let best = null, bestDist = Infinity;
    const tx = Number(tower.x) + 0.5;
    const ty = Number(tower.y) + 0.5;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - tx, dy = e.y - ty;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= TOWER_RANGE && dist < bestDist) { bestDist = dist; best = e; }
    }
    return best;
  }

  _killEnemy(enemy) {
    enemy.alive = false;

    // Death burst
    for (let p = 0; p < 7; p++) {
      const angle = (p / 7) * Math.PI * 2;
      this.particles.push({
        id: uid(), x: enemy.x, y: enemy.y,
        vx: Math.cos(angle) * (1.2 + Math.random() * 0.8),
        vy: Math.sin(angle) * (1.2 + Math.random() * 0.8),
        color: '#FFA726', age: 0, maxAge: 0.45 + Math.random() * 0.15,
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

    // Apply damage up to the on-chain total remaining.
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
    for (let p = 0; p < 5; p++) {
      const angle = (p / 5) * Math.PI * 2;
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
      done:              this.done,
      enemies:           this.enemies.map((e) => ({ ...e })),
      towers:            this.towers.map((t) => ({ ...t })),
      tokens:            { ...this.tokens },
      maxTokens:         { ...this.maxTokens },
      projectiles:       [...this.projectiles],
      particles:         [...this.particles],
      floatingTexts:     [...this.floatingTexts],
      screenShakePulse:  this._screenShakePulse,
      baseHealth:        this.baseHealth,
    };
  }
}
