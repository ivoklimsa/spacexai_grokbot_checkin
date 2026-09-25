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
): PhysicsBody {
  const margin = radius + SEPARATION_PAD + 8;
  let x = margin + Math.random() * Math.max(1, width - margin * 2);
  let y = margin + Math.random() * Math.max(1, height - margin * 2);

  let found = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidateX = margin + Math.random() * Math.max(1, width - margin * 2);
    const candidateY = margin + Math.random() * Math.max(1, height - margin * 2);
    const overlaps = existing.some((other) => {
      const dx = candidateX - other.x;
      const dy = candidateY - other.y;
      return Math.hypot(dx, dy) < radius + other.radius + SEPARATION_PAD + 16;
    });
    if (!overlaps) {
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

  return {
    id,
    x,
    y,
    vx,
    vy,
    radius,
    bornAt: performance.now(),
  };
}

export function stepPhysics(
  bodies: PhysicsBody[],
  width: number,
  height: number,
  dt: number,
) {
  const safeDt = Math.min(dt, 0.05);
  const steps = Math.max(1, Math.ceil(safeDt / 0.016));
  const stepDt = safeDt / steps;

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
    }
    resolveCollisions(bodies);
    for (const body of bodies) {
      clampToBounds(body, width, height);
    }
  }
}
