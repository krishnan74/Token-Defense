import {
  BASE_MAX_HP,
  BASE_X,
  BASE_Y,
  ENEMIES,
  FACTORIES,
  GOLD_PER_WAVE,
  getTokenTier,
  PATH_WAYPOINTS,
  TOKEN_NAMES,
  TOWER_RANGE,
  TOWERS,
  WAVE_COMPOSITIONS,
} from '../constants.js';

let _nextId = 0;
const uid = () => ++_nextId;

// Tower projectile colors by type
const PROJECTILE_COLORS = ['#4CAF50', '#CE93D8', '#FFC107'];

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

function computeTokensAvailable(factories, gameState) {
  const tokens = {
    input_tokens: gameState.input_tokens ?? 0,
    image_tokens: gameState.image_tokens ?? 0,
    code_tokens: gameState.code_tokens ?? 0,
  };
  for (const f of factories) {
    if (!f.is_active) continue;
    const def = FACTORIES[f.factory_type];
    const output = Math.floor(def.baseOutput * (1 + 0.5 * (f.level - 1)));
    tokens[def.tokenType] += output;
  }
  return tokens;
}

export class WaveSimulator {
  constructor({ towers, factories, gameState, waveNumber }) {
    this.waveNumber = waveNumber;
    this.towers = towers.filter((t) => t.is_alive).map((t) => ({
      ...t,
      health: Number(t.health),
      target: null,
      fireCooldown: 0,
      attackFlash: 0,
    }));
    this.factories = factories;

    this.tokens = computeTokensAvailable(factories, gameState);
    this.maxTokens = { ...this.tokens };

    this.spawnQueue = buildSpawnQueue(waveNumber);
    this.spawnTimer = 0;
    this.enemies = [];
    this._allSpawned = false;

    this.towerDamages = new Map();
    this.goldEarned = 0;
    this.baseDamage = 0;
    this.enemiesKilled = 0;
    this.baseHealth = Number(gameState.base_health ?? BASE_MAX_HP);

    this.projectiles = [];
    this.floatingTexts = [];
    this.particles = [];
    this._screenShakePulse = 0;

    this.done = false;
  }

  /** Advance by dt seconds; returns rendering snapshot. */
  step(dt) {
    if (this.done) return this._snapshot();

    this._processSpawns(dt);

    // Move enemies along waypoints
    for (const e of this.enemies) {
      if (!e.alive) continue;
      this._moveEnemy(e, dt);
    }

    // Towers fire
    for (const tower of this.towers) {
      if (!tower.is_alive) continue;
      if (tower.attackFlash > 0) tower.attackFlash = Math.max(0, tower.attackFlash - dt);
      tower.fireCooldown -= dt;
      if (tower.fireCooldown > 0) continue;

      const tDef = TOWERS[Number(tower.tower_type)];
      const tokenKey = TOKEN_NAMES[tDef.tokenType];
      const tier = getTokenTier(this.tokens[tokenKey], this.maxTokens[tokenKey]);

      if (this.tokens[tokenKey] >= tDef.tokenCost) {
        this.tokens[tokenKey] -= tDef.tokenCost;
      }
      tower.fireCooldown = tier.cooldown;

      const target = this._nearestEnemy(tower);
      if (!target) continue;

      const tx = Number(tower.x) + 0.5;
      const ty = Number(tower.y) + 0.5;
      this.projectiles.push({
        id: uid(),
        fromX: tx, fromY: ty,
        toX: target.x, toY: target.y,
        progress: 0,
        duration: 0.13,
        color: PROJECTILE_COLORS[Number(tower.tower_type)] ?? '#fff',
      });
      tower.attackFlash = 0.18;

      const damage = Math.round(tDef.damage * tier.dmgMultiplier);
      target.hp -= damage;
      target.hitFlash = 0.1;

      this.floatingTexts.push({
        id: uid(),
        x: target.x, y: target.y - 0.5,
        text: `-${damage}`,
        color: '#EF5350',
        age: 0, maxAge: 0.65,
      });

      if (target.hp <= 0) {
        target.alive = false;
        this.goldEarned += target.gold;
        this.enemiesKilled++;

        // Death burst particles
        for (let p = 0; p < 7; p++) {
          const angle = (p / 7) * Math.PI * 2;
          this.particles.push({
            id: uid(),
            x: target.x, y: target.y,
            vx: Math.cos(angle) * (1.2 + Math.random() * 0.8),
            vy: Math.sin(angle) * (1.2 + Math.random() * 0.8),
            color: '#FFA726',
            age: 0, maxAge: 0.45 + Math.random() * 0.15,
          });
        }

        this.floatingTexts.push({
          id: uid(),
          x: target.x + 0.3, y: target.y - 1.0,
          text: `+${target.gold}g`,
          color: '#FFD600',
          age: 0, maxAge: 0.9,
        });
      }
    }

    // Advance projectiles
    this.projectiles = this.projectiles.filter((p) => {
      p.progress += dt / p.duration;
      return p.progress < 1;
    });

    // Advance floating texts (drift upward)
    this.floatingTexts = this.floatingTexts.filter((t) => {
      t.age += dt;
      t.y -= 0.55 * dt;
      return t.age < t.maxAge;
    });

    // Advance particles
    this.particles = this.particles.filter((p) => {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return p.age < p.maxAge;
    });

    // Decay hit flash on enemies
    for (const e of this.enemies) {
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
    }

    // Check wave complete
    const anyAlive = this.enemies.some((e) => e.alive);
    if (this._allSpawned && !anyAlive) {
      this.done = true;
    }

    return this._snapshot();
  }

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
      id: uid(),
      type,
      x: wp0.x, y: wp0.y,
      waypointIndex: 1,
      hp: def.hp, maxHp: def.hp,
      speed: def.speed,
      gold: def.gold,
      alive: true,
      angle: Math.PI, // initially facing left
      hitFlash: 0,
    };
  }

  _moveEnemy(enemy, dt) {
    if (enemy.waypointIndex >= PATH_WAYPOINTS.length) {
      // Reached base
      enemy.alive = false;
      const dmg = ENEMIES[enemy.type]?.damage ?? 1;
      this.baseDamage += dmg;
      this.baseHealth = Math.max(0, this.baseHealth - dmg);
      this._screenShakePulse++;

      this.floatingTexts.push({
        id: uid(),
        x: BASE_X + 0.5, y: BASE_Y - 0.4,
        text: `-${dmg}`,
        color: '#F44336',
        age: 0, maxAge: 0.9,
      });

      for (let p = 0; p < 5; p++) {
        const angle = (p / 5) * Math.PI * 2;
        this.particles.push({
          id: uid(),
          x: BASE_X + 0.5, y: BASE_Y + 0.5,
          vx: Math.cos(angle) * 0.8,
          vy: Math.sin(angle) * 0.8,
          color: '#F44336',
          age: 0, maxAge: 0.4,
        });
      }
      return;
    }

    const target = PATH_WAYPOINTS[enemy.waypointIndex];
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0.001) {
      enemy.angle = Math.atan2(dy, dx);
    }

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

  _nearestEnemy(tower) {
    let best = null;
    let bestDist = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - Number(tower.x);
      const dy = e.y - Number(tower.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= TOWER_RANGE && dist < bestDist) {
        bestDist = dist;
        best = e;
      }
    }
    return best;
  }

  _applyDamageToTower(tower, damage) {
    tower.health = Math.max(0, tower.health - damage);
    const prev = this.towerDamages.get(tower.tower_id) ?? 0;
    this.towerDamages.set(tower.tower_id, prev + damage);
    if (tower.health === 0) tower.is_alive = false;
  }

  /** Returns the committed result at wave end. */
  getResult() {
    const towerDamages = [];
    for (const [towerId, dmg] of this.towerDamages.entries()) {
      towerDamages.push({ tower_id: towerId, damage: dmg });
    }
    const tokensConsumed = {
      input_tokens: Math.max(0, this.maxTokens.input_tokens - this.tokens.input_tokens),
      image_tokens: Math.max(0, this.maxTokens.image_tokens - this.tokens.image_tokens),
      code_tokens: Math.max(0, this.maxTokens.code_tokens - this.tokens.code_tokens),
    };
    const waveBonus = GOLD_PER_WAVE(this.waveNumber);
    return {
      towerDamages,
      killGold: this.goldEarned,                  // sent to contract
      goldEarned: this.goldEarned + waveBonus,    // total for display (kills + bonus)
      tokensConsumed,
      baseDamage: this.baseDamage,
      enemiesKilled: this.enemiesKilled,
    };
  }

  _snapshot() {
    return {
      enemies: this.enemies.map((e) => ({ ...e })),
      towers: this.towers.map((t) => ({ ...t })),
      tokens: { ...this.tokens },
      maxTokens: { ...this.maxTokens },
      projectiles: this.projectiles.map((p) => ({ ...p })),
      floatingTexts: this.floatingTexts.map((t) => ({ ...t })),
      particles: this.particles.map((p) => ({ ...p })),
      baseHealth: this.baseHealth,
      screenShakePulse: this._screenShakePulse,
      goldEarned: this.goldEarned,
      done: this.done,
    };
  }
}
