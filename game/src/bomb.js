// The bomb: the objective beyond killing. One attacker carries it; on death it
// drops where they fell and any attacker can pick it up. Hold E inside a site
// to plant it (3.5 s), then it ticks for 40 s while beeping faster and faster;
// a defender holding E beside it defuses it in 5 s. The round logic in
// rounds.js listens for the exploded / defused events this module emits.
import * as THREE from 'three';
import { ECONOMY, MATCH } from './config.js';
import { emit } from './state.js';
import { PALETTE } from './palette.js';

export function createBomb(scene, map, state, audio) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x1c2129, roughness: 0.5, metalness: 0.6 }),
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }),
  );
  light.position.set(0, 0.13, 0);
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.04, 0.1),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  strip.position.set(0, 0.02, 0);
  group.add(body, light, strip);
  group.visible = false;
  scene.add(group);
  const blink = new THREE.PointLight(new THREE.Color(PALETTE.danger), 0, 6, 2);
  scene.add(blink);

  let beepAt = 0;
  let blinkPhase = 0;

  function siteAt(x, z) {
    for (const [name, site] of Object.entries(map.sites)) {
      if (Math.hypot(x - site.center.x, z - site.center.z) < site.radius) return name;
    }
    return null;
  }

  function drop(position) {
    const bomb = state.bomb;
    bomb.state = 'dropped';
    bomb.carrier = null;
    bomb.position = position.clone();
    bomb.position.y = 0.12;
    bomb.plantProgress = 0;
    group.position.copy(bomb.position);
    group.visible = true;
  }

  function reset(carrier) {
    const bomb = state.bomb;
    bomb.state = 'carried';
    bomb.carrier = carrier;
    bomb.position = null;
    bomb.site = null;
    bomb.fuseLeft = 0;
    bomb.plantProgress = 0;
    bomb.defuseProgress = 0;
    bomb.planter = null;
    bomb.defuser = null;
    bomb.outcome = null;
    if (carrier) carrier.carryingBomb = true;
    group.visible = false;
    blink.intensity = 0;
  }

  function step(dt) {
    const bomb = state.bomb;
    blinkPhase += dt;
    if (bomb.state === 'carried') {
      const carrier = bomb.carrier;
      if (!carrier || !carrier.alive) {
        if (carrier) drop(carrier.position);
        return;
      }
      // Planting: the carrier holds E inside a site.
      const site = siteAt(carrier.position.x, carrier.position.z);
      if (site && carrier.using) {
        bomb.planter = carrier;
        bomb.plantProgress += dt / MATCH.plantTime;
        if (bomb.plantProgress >= 1) {
          bomb.state = 'planted';
          bomb.site = site;
          bomb.fuseLeft = MATCH.bombFuse;
          bomb.position = carrier.position.clone();
          bomb.position.y = 0.12;
          carrier.carryingBomb = false;
          bomb.carrier = null;
          group.position.copy(bomb.position);
          group.visible = true;
          carrier.money = Math.min(16000, carrier.money + ECONOMY.plant);
          audio.plant();
          emit(state, { type: 'bombPlanted', site, planter: carrier });
        }
      } else {
        bomb.plantProgress = Math.max(0, bomb.plantProgress - dt / 1.5);
        bomb.planter = null;
      }
      return;
    }

    if (bomb.state === 'dropped') {
      // Any living attacker walking over it picks it up.
      for (const fighter of state.fighters) {
        if (!fighter.alive || fighter.team !== 'atk') continue;
        if (Math.hypot(fighter.position.x - bomb.position.x, fighter.position.z - bomb.position.z) < 1.2) {
          bomb.state = 'carried';
          bomb.carrier = fighter;
          fighter.carryingBomb = true;
          group.visible = false;
          emit(state, { type: 'bombPickedUp', fighter });
          break;
        }
      }
      return;
    }

    if (bomb.state === 'planted') {
      bomb.fuseLeft -= dt;
      // Beep faster as the fuse runs down; the light blinks with it.
      const interval = bomb.fuseLeft < 10 ? 0.35 : bomb.fuseLeft < 20 ? 0.6 : 1.0;
      if (state.time >= beepAt) {
        beepAt = state.time + interval;
        audio.beep();
      }
      blink.intensity = (Math.sin(blinkPhase * (Math.PI * 2 / interval)) > 0) ? 8 : 0;
      blink.position.copy(bomb.position);
      blink.position.y = 0.6;
      if (bomb.fuseLeft <= 0) {
        bomb.state = 'gone';
        bomb.outcome = 'exploded';
        group.visible = false;
        blink.intensity = 0;
        emit(state, { type: 'bombExploded', site: bomb.site, position: bomb.position });
        return;
      }
      // Defusing: a defender holding E beside the bomb.
      let defuser = null;
      for (const fighter of state.fighters) {
        if (!fighter.alive || fighter.team !== 'def') continue;
        if (Math.hypot(fighter.position.x - bomb.position.x, fighter.position.z - bomb.position.z) < 1.6) {
          defuser = fighter;
          break;
        }
      }
      if (defuser && defuser.using) {
        bomb.defuser = defuser;
        bomb.defuseProgress += dt / MATCH.defuseTime;
        if (bomb.defuseProgress >= 1) {
          bomb.state = 'gone';
          bomb.outcome = 'defused';
          group.visible = false;
          blink.intensity = 0;
          emit(state, { type: 'bombDefused', site: bomb.site, defuser });
        }
      } else {
        bomb.defuseProgress = Math.max(0, bomb.defuseProgress - dt / 1.5);
        bomb.defuser = null;
      }
    }
  }

  return { step, drop, reset, siteAt, group };
}
