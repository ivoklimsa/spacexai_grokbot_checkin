export type PhysicsBody = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  bornAt: number;
};

const MAX_SPEED = 70;
const MIN_SPEED = 16;
const DAMPING = 0.999;
const SEPARATION_PAD = 4;
/** Keeps a resting hitbox a hair off the exclusion edge so float error cannot count as overlap. */
const EXCLUSION_SKIN = 0.5;

/** Axis-aligned no-enter region in stage coordinates (already padded). */
export type ExclusionRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function exclusionActive(
  rect: ExclusionRect | null | undefined,
): rect is ExclusionRect {
  return !!rect && rect.right > rect.left && rect.bottom > rect.top;
}

/** Circle overlaps the rect interior. Edge contact is allowed. */
function circleOverlapsRect(
  x: number,
  y: number,
  radius: number,
  rect: ExclusionRect,
): boolean {
  const closestX = Math.min(Math.max(x, rect.left), rect.right);
  const closestY = Math.min(Math.max(y, rect.top), rect.bottom);
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy < radius * radius;
}

/**
 * Push a circle out of an exclusion rect and bounce, same spirit as
 * `clampToBounds`: clamp the center so the hitbox no longer overlaps, and
 * force velocity away from the obstacle. Exits that would leave the screen
 * are skipped so a corner logo cannot pin a body against the wall.
 */
function resolveExclusion(
  body: PhysicsBody,
  rect: ExclusionRect,
  width: number,
  height: number,
) {
  const minX = body.radius;
  const maxX = Math.max(body.radius, width - body.radius);
  const minY = body.radius;
  const maxY = Math.max(body.radius, height - body.radius);
  const inBounds = (x: number, y: number) =>
    x >= minX - 0.01 && x <= maxX + 0.01 && y >= minY - 0.01 && y <= maxY + 0.01;

  const closestX = Math.min(Math.max(body.x, rect.left), rect.right);
  const closestY = Math.min(Math.max(body.y, rect.top), rect.bottom);
  const dx = body.x - closestX;
  const dy = body.y - closestY;
  const distSq = dx * dx + dy * dy;

  const applyExit = (
    x: number,
    y: number,
    axis: "x" | "y",
    sign: -1 | 1,
  ) => {
    body.x = x;
    body.y = y;
    if (axis === "x") body.vx = sign * Math.abs(body.vx);
    else body.vy = sign * Math.abs(body.vy);
  };

  const cardinalExits: Array<{
    x: number;
    y: number;
    axis: "x" | "y";
    sign: -1 | 1;
  }> = [
    { x: rect.left - body.radius - EXCLUSION_SKIN, y: body.y, axis: "x", sign: -1 },
    { x: rect.right + body.radius + EXCLUSION_SKIN, y: body.y, axis: "x", sign: 1 },
    { x: body.x, y: rect.top - body.radius - EXCLUSION_SKIN, axis: "y", sign: -1 },
    { x: body.x, y: rect.bottom + body.radius + EXCLUSION_SKIN, axis: "y", sign: 1 },
  ];

  const takeNearestExit = () => {
    let best: (typeof cardinalExits)[number] | null = null;
    let bestDist = Infinity;
    for (const exit of cardinalExits) {
      const x = Math.min(Math.max(exit.x, minX), maxX);
      const y = Math.min(Math.max(exit.y, minY), maxY);
      if (circleOverlapsRect(x, y, body.radius, rect)) continue;
      const d = Math.hypot(x - body.x, y - body.y);
      if (d < bestDist) {
        best = { ...exit, x, y };
        bestDist = d;
      }
    }
    if (!best) return;
    applyExit(best.x, best.y, best.axis, best.sign);
  };

  // Center is inside the rect — no unique surface normal.
  if (distSq < 1e-8) {
    takeNearestExit();
    return;
  }

  const dist = Math.sqrt(distSq);
  if (dist >= body.radius) return;

  const nx = dx / dist;
  const ny = dy / dist;
  const nextX = body.x + nx * (body.radius + EXCLUSION_SKIN - dist);
  const nextY = body.y + ny * (body.radius + EXCLUSION_SKIN - dist);

  if (inBounds(nextX, nextY)) {
    body.x = nextX;
    body.y = nextY;
    const outward = body.vx * nx + body.vy * ny;
    if (outward < 0) {
      body.vx -= 2 * outward * nx;
      body.vy -= 2 * outward * ny;
    }
    return;
  }

  takeNearestExit();
}

function clampSpeed(body: PhysicsBody) {
  const speed = Math.hypot(body.vx, body.vy);
  if (speed < 0.01) {
    const angle = Math.random() * Math.PI * 2;
    body.vx = Math.cos(angle) * MIN_SPEED;
    body.vy = Math.sin(angle) * MIN_SPEED;
    return;
  }
  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    body.vx *= scale;
    body.vy *= scale;
  } else if (speed < MIN_SPEED) {
    const scale = MIN_SPEED / speed;
    body.vx *= scale;
    body.vy *= scale;
  }
}

function resolveCollisions(bodies: PhysicsBody[]) {
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);

        // Identical centers — nudge apart so the normal is defined.
        if (dist < 0.0001) {
          dx = 0.01 + Math.random() * 0.02;
          dy = 0.01 + Math.random() * 0.02;
          dist = Math.hypot(dx, dy);
        }

        const minDist = a.radius + b.radius + SEPARATION_PAD;
        if (dist >= minDist) continue;

        const nx = dx / dist;
        const ny = dy / dist;

        const overlap = minDist - dist;
        const half = overlap * 0.5;
        a.x -= nx * half;
        a.y -= ny * half;
        b.x += nx * half;
        b.y += ny * half;

        const dvx = a.vx - b.vx;
        const dvy = a.vy - b.vy;
        const velAlongNormal = dvx * nx + dvy * ny;
        if (velAlongNormal > 0) continue;

        // Fully reverse closing velocity along the normal (equal mass).
        const impulse = -velAlongNormal;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;

        // Extra kick so soft floats don't stay glued.
        const kick = 12;
        a.vx -= nx * kick;
        a.vy -= ny * kick;
        b.vx += nx * kick;
        b.vy += ny * kick;

        clampSpeed(a);
        clampSpeed(b);
      }
    }
  }
}

function clampToBounds(body: PhysicsBody, width: number, height: number) {
  const minX = body.radius;
  const maxX = Math.max(body.radius, width - body.radius);
  const minY = body.radius;
  const maxY = Math.max(body.radius, height - body.radius);

  if (body.x < minX) {
    body.x = minX;
    body.vx = Math.abs(body.vx);
  } else if (body.x > maxX) {
    body.x = maxX;
    body.vx = -Math.abs(body.vx);
  }

  if (body.y < minY) {
    body.y = minY;
    body.vy = Math.abs(body.vy);
  } else if (body.y > maxY) {
    body.y = maxY;
    body.vy = -Math.abs(body.vy);
  }
}

export function createBody(
  id: string,
  width: number,
  height: number,
  radius: number,
  existing: PhysicsBody[],
  exclusion?: ExclusionRect | null,
): PhysicsBody {
  const margin = radius + SEPARATION_PAD + 8;
  let x = margin + Math.random() * Math.max(1, width - margin * 2);
  let y = margin + Math.random() * Math.max(1, height - margin * 2);

  let found = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidateX = margin + Math.random() * Math.max(1, width - margin * 2);
    const candidateY = margin + Math.random() * Math.max(1, height - margin * 2);
    const overlapsBot = existing.some((other) => {
      const dx = candidateX - other.x;
      const dy = candidateY - other.y;
      return Math.hypot(dx, dy) < radius + other.radius + SEPARATION_PAD + 16;
    });
    const overlapsExclusion =
      exclusionActive(exclusion) &&
      circleOverlapsRect(candidateX, candidateY, radius, exclusion);
    if (!overlapsBot && !overlapsExclusion) {
      x = candidateX;
      y = candidateY;
      found = true;
      break;
    }
  }

  if (!found) {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) {
      x = margin;
      y = margin + Math.random() * Math.max(1, height - margin * 2);
    } else if (side === 1) {
      x = width - margin;
      y = margin + Math.random() * Math.max(1, height - margin * 2);
    } else if (side === 2) {
      x = margin + Math.random() * Math.max(1, width - margin * 2);
      y = margin;
    } else {
      x = margin + Math.random() * Math.max(1, width - margin * 2);
      y = height - margin;
    }
  }

  const angle = Math.random() * Math.PI * 2;
  const speed = 24 + Math.random() * 28;
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;

  if (!found) {
    const cx = width / 2 - x;
    const cy = height / 2 - y;
    const len = Math.hypot(cx, cy) || 1;
    vx = (cx / len) * speed;
    vy = (cy / len) * speed;
  }

  const body: PhysicsBody = {
    id,
    x,
    y,
    vx,
    vy,
    radius,
    bornAt: performance.now(),
  };

  clampToBounds(body, width, height);
  if (exclusionActive(exclusion)) {
    resolveExclusion(body, exclusion, width, height);
  }

  return body;
}

export function stepPhysics(
  bodies: PhysicsBody[],
  width: number,
  height: number,
  dt: number,
  exclusion?: ExclusionRect | null,
) {
  const safeDt = Math.min(dt, 0.05);
  const steps = Math.max(1, Math.ceil(safeDt / 0.016));
  const stepDt = safeDt / steps;
  const blocked = exclusionActive(exclusion) ? exclusion : null;

  for (let step = 0; step < steps; step++) {
    for (const body of bodies) {
      body.vx += Math.sin(performance.now() / 900 + body.x * 0.01) * 3 * stepDt;
      body.vy += Math.cos(performance.now() / 1100 + body.y * 0.01) * 3 * stepDt;
      body.vx *= DAMPING;
      body.vy *= DAMPING;
      clampSpeed(body);
      body.x += body.vx * stepDt;
      body.y += body.vy * stepDt;
      clampToBounds(body, width, height);
      if (blocked) resolveExclusion(body, blocked, width, height);
    }
    resolveCollisions(bodies);
    for (const body of bodies) {
      clampToBounds(body, width, height);
      if (blocked) resolveExclusion(body, blocked, width, height);
    }
  }
}
