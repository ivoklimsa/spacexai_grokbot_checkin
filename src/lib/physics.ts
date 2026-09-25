export type Vec = { x: number; y: number };

export type PhysicsBody = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  bornAt: number;
};

const MAX_SPEED = 95;
const MIN_SPEED = 18;
const DAMPING = 0.9992;

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

export function createBody(
  id: string,
  width: number,
  height: number,
  radius: number,
  existing: PhysicsBody[],
): PhysicsBody {
  const margin = radius + 8;
  let x = margin + Math.random() * Math.max(1, width - margin * 2);
  let y = margin + Math.random() * Math.max(1, height - margin * 2);

  // Prefer a free spot; fall back to edge spawn if crowded.
  let found = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const candidateX = margin + Math.random() * Math.max(1, width - margin * 2);
    const candidateY = margin + Math.random() * Math.max(1, height - margin * 2);
    const overlaps = existing.some((other) => {
      const dx = candidateX - other.x;
      const dy = candidateY - other.y;
      return Math.hypot(dx, dy) < radius + other.radius + 12;
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
  const speed = 28 + Math.random() * 36;
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;

  // Push inward from edge spawns.
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
  const safeDt = Math.min(dt, 0.033);

  for (const body of bodies) {
    // Gentle drift wobble so motion feels alive.
    body.vx += Math.sin(performance.now() / 900 + body.x * 0.01) * 4 * safeDt;
    body.vy += Math.cos(performance.now() / 1100 + body.y * 0.01) * 4 * safeDt;

    body.vx *= DAMPING;
    body.vy *= DAMPING;
    clampSpeed(body);

    body.x += body.vx * safeDt;
    body.y += body.vy * safeDt;

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

  // Multiple passes keep dense crowds from remaining stacked.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const minDist = a.radius + b.radius;

        if (dist >= minDist) continue;

        const nx = dx / dist;
        const ny = dy / dist;

        // Separate overlapping circles.
        const overlap = minDist - dist;
        const half = overlap / 2 + 0.5;
        a.x -= nx * half;
        a.y -= ny * half;
        b.x += nx * half;
        b.y += ny * half;

        // Elastic bump along contact normal (from a → b).
        const dvx = a.vx - b.vx;
        const dvy = a.vy - b.vy;
        const velAlongNormal = dvx * nx + dvy * ny;
        // Positive means already separating.
        if (velAlongNormal > 0) continue;

        const impulse = -velAlongNormal;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;

        clampSpeed(a);
        clampSpeed(b);
      }
    }
  }
}
