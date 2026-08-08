import { TILE } from "./world.js";

export function createPlayer(start, upgrades = new Set(), speed = 170) {
  const hands = upgrades.has("cart") ? 2 : 1;
  const half = TILE / 2;
  return {
    x: start.x * TILE + half,
    y: start.y * TILE + half,
    r: Math.max(12, TILE * 0.28),
    speed,
    facing: Math.PI / 2,
    hold: [],
    maxHold: hands,
    anim: 0,
    slip: 0,
  };
}

export function updatePlayer(player, input, world, dt) {
  let dx = 0;
  let dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;

  let spd = player.speed;
  if (world.slippery > 0) {
    spd *= 0.55;
    player.slip += dt;
  }

  if (dx || dy) {
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    player.facing = Math.atan2(dy, dx);
    const animRate = world.hellMode ? 3.8 : world.deadAura ? 4.5 : 10;
    player.anim += dt * animRate;
  } else {
    player.anim *= 0.9;
  }

  const { collides } = world._api;
  const nx = player.x + dx * spd * dt;
  const ny = player.y + dy * spd * dt;

  if (!collides(world, nx, player.y, player.r)) player.x = nx;
  if (!collides(world, player.x, ny, player.r)) player.y = ny;

  const pad = TILE * 0.45;
  player.x = Math.max(pad, Math.min(world.W * TILE - pad, player.x));
  player.y = Math.max(pad, Math.min(world.H * TILE - pad, player.y));
}
