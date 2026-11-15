// Movement: acceleration, friction, gravity, crouch and jump, resolved as a box
// against the world's colliders one axis at a time, so a wall never swallows a
// fighter. moveKinematic is shared by the human controller and the bots, so both
// obey the same physics; the human adds look, recoil and the input mapping.
import * as THREE from 'three';
import { BODY } from './config.js';

const probe = new THREE.Box3();
const wish = new THREE.Vector3();

function overlaps(colliders, x, y, z, radius, height, lift) {
  probe.min.set(x - radius, y + lift, z - radius);
  probe.max.set(x + radius, y + height - lift, z + radius);
  for (const collider of colliders) {
    if (probe.intersectsBox(collider)) return collider;
  }
  return null;
}

// Moves a fighter's position/velocity for one step. wishX/wishZ is the desired
// direction (unit length or zero), speed the target speed, jump whether to jump.
// Returns the ground state. Pure kinematics: no input, no look.
export function moveKinematic(fighter, colliders, dt, wishX, wishZ, speed, jump) {
  const radius = BODY.radius;
  const height = fighter.height;
  const blend = Math.min(1, (fighter.onGround ? BODY.groundAccel : BODY.airAccel) * dt / Math.max(speed, 0.01));
  fighter.velocity.x += (wishX * speed - fighter.velocity.x) * blend;
  fighter.velocity.z += (wishZ * speed - fighter.velocity.z) * blend;
  if (fighter.onGround && wishX === 0 && wishZ === 0) {
    const damp = Math.max(0, 1 - BODY.friction * dt);
    fighter.velocity.x *= damp;
    fighter.velocity.z *= damp;
  }
  if (jump && fighter.onGround) {
    fighter.velocity.y = BODY.jumpSpeed;
    fighter.onGround = false;
  }
  fighter.velocity.y -= BODY.gravity * dt;

  const p = fighter.position;
  const nextX = p.x + fighter.velocity.x * dt;
  if (!overlaps(colliders, nextX, p.y, p.z, radius, height, 0.04)) p.x = nextX;
  else fighter.velocity.x = 0;
  const nextZ = p.z + fighter.velocity.z * dt;
  if (!overlaps(colliders, p.x, p.y, nextZ, radius, height, 0.04)) p.z = nextZ;
  else fighter.velocity.z = 0;

  p.y += fighter.velocity.y * dt;
  fighter.onGround = false;
  const hit = overlaps(colliders, p.x, p.y, p.z, radius, height, 0);
  if (hit && fighter.velocity.y <= 0) {
    p.y = hit.max.y;
    fighter.velocity.y = 0;
    fighter.onGround = true;
  } else if (hit) {
    p.y = hit.min.y - height;
    fighter.velocity.y = 0;
  }
  if (p.y < 0) {
    p.y = 0;
    fighter.velocity.y = 0;
    fighter.onGround = true;
  }
  fighter.velocity.y = Math.max(-30, fighter.velocity.y);
}

export function groundSpeed(fighter) {
  return Math.hypot(fighter.velocity.x, fighter.velocity.z);
}

// The human controller: wraps moveKinematic with look, crouch and the keys.
export function createPlayer(colliders) {
  return {
    look(fighter, dx, dy, sensitivity = 0.0022) {
      fighter.yaw -= dx * sensitivity;
      fighter.pitch = Math.max(-1.45, Math.min(1.45, fighter.pitch - dy * sensitivity));
    },
    recoil(fighter, pitchKick, yawKick) {
      fighter.pitch = Math.min(1.45, fighter.pitch + pitchKick);
      fighter.yaw += yawKick;
    },
    step(fighter, dt, keys) {
      const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
      if (wantCrouch && !fighter.crouching) {
        fighter.crouching = true;
        fighter.height = BODY.crouchHeight;
      } else if (!wantCrouch && fighter.crouching
        && !overlaps(colliders, fighter.position.x, fighter.position.y, fighter.position.z, BODY.radius, BODY.standHeight, 0.02)) {
        fighter.crouching = false;
        fighter.height = BODY.standHeight;
      }
      const eyeTarget = fighter.crouching ? BODY.crouchEye : BODY.standEye;
      fighter.eye += (eyeTarget - fighter.eye) * Math.min(1, dt * 12);

      const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      wish.set(0, 0, 0);
      if (forward || strafe) {
        const sin = Math.sin(fighter.yaw);
        const cos = Math.cos(fighter.yaw);
        wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
      }
      const sneaking = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const speed = fighter.crouching ? BODY.crouchSpeed : sneaking ? BODY.sneakSpeed : BODY.walkSpeed;
      moveKinematic(fighter, colliders, dt, wish.x, wish.z, speed, keys.has('Space'));
    },
  };
}
