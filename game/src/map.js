// Harbor Depot: an original container-yard map, 60 x 44 m, built from boxes.
// Two bomb sites (A warehouse west, B dock east), three lanes (A-long, mid,
// B-long) and a connector crossing mid. Every box is both a collider for
// movement and a surface bullets stop on. The waypoint graph under it is what
// the bots walk: nodes on the lanes, edges between neighbours, BFS for routes.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_H = 4.2;

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const mat = {
    floor: new THREE.MeshStandardMaterial({ color: 0x1a2029, roughness: 0.95 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x232c38, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x12161d, roughness: 0.92 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x4a3b28, roughness: 0.85 }),
    crate2: new THREE.MeshStandardMaterial({ color: 0x37424f, roughness: 0.8, metalness: 0.25 }),
    container: new THREE.MeshStandardMaterial({ color: 0x274b4a, roughness: 0.7, metalness: 0.3 }),
    container2: new THREE.MeshStandardMaterial({ color: 0x59331d, roughness: 0.7, metalness: 0.3 }),
    neon: new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
    neonA: new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.attack) }),
    neonB: new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.defend) }),
  };

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Floor and the perimeter. North is -z (defenders), south is +z (attackers).
  box(60.4, 0.4, 44.4, 0, -0.2, 0, mat.floor);
  box(60.4, 5, 0.4, 0, 2.5, -22.2, mat.wall);
  box(60.4, 5, 0.4, 0, 2.5, 22.2, mat.wall);
  box(0.4, 5, 44.4, -30.2, 2.5, 0, mat.wall);
  box(0.4, 5, 44.4, 30.2, 2.5, 0, mat.wall);

  // Mid corridor walls (x = +/-6), with the connector gap at z -4..4.
  for (const sx of [-6, 6]) {
    box(0.4, WALL_H, 12, sx, WALL_H / 2, -10, mat.wall);
    box(0.4, WALL_H, 12, sx, WALL_H / 2, 10, mat.wall);
  }
  // Mid doors at z = 0: two pillars and a beam, a 3 m gap in the middle.
  box(4.5, 3.6, 0.4, -3.75, 1.8, 0, mat.dark);
  box(4.5, 3.6, 0.4, 3.75, 1.8, 0, mat.dark);
  box(12, 0.6, 0.4, 0, 3.9, 0, mat.dark);

  // Connector walls (z = +/-2), with gaps at mid and at the longs.
  for (const sz of [-2, 2]) {
    box(18, WALL_H, 0.4, -15, WALL_H / 2, sz, mat.wall);
    box(18, WALL_H, 0.4, 15, WALL_H / 2, sz, mat.wall);
  }
  // Site gates: walls at x = +/-12, z -16..-10, leaving a door into each site.
  box(0.4, WALL_H, 6, -12, WALL_H / 2, -13, mat.wall);
  box(0.4, WALL_H, 6, 12, WALL_H / 2, -13, mat.wall);

  // Cover: crates to crouch behind, containers to hide behind. Mirrored on x.
  const cover = [
    // [w, h, d, x, z, material]
    [1.2, 1.1, 1.2, -2.5, 8, 'crate'], [1.2, 1.1, 1.2, 2.5, -8, 'crate'],
    [1.2, 1.1, 1.2, 2.5, 12, 'crate'], [1.2, 1.1, 1.2, -2.5, -12, 'crate'],
    [6, 2.6, 2.4, 0, -16.5, 'container'],
    [1.2, 1.1, 1.2, -24, 8, 'crate'], [1.2, 1.1, 1.2, -24, 0, 'crate'],
    [1.2, 1.1, 1.2, -24, -6, 'crate2'], [2.4, 1.1, 1.2, -26.5, -10, 'crate'],
    [1.2, 1.1, 1.2, 24, 8, 'crate'], [1.2, 1.1, 1.2, 24, 0, 'crate'],
    [1.2, 1.1, 1.2, 24, -6, 'crate2'], [2.4, 1.1, 1.2, 26.5, -10, 'crate'],
    [1.2, 1.1, 1.2, -12, 0, 'crate'], [1.2, 1.1, 1.2, 12, 0, 'crate'],
    [1.2, 1.1, 1.2, -8, 18, 'crate'], [1.2, 1.1, 1.2, 8, 18, 'crate'],
    [6, 2.6, 2.4, -22, -15.5, 'container2'], [6, 2.6, 2.4, 22, -15.5, 'container'],
    [2.4, 1.1, 2.4, -16.5, -10.5, 'crate'], [2.4, 1.1, 2.4, 16.5, -10.5, 'crate'],
    [1.2, 1.1, 1.2, -26, -14.5, 'crate2'], [1.2, 1.1, 1.2, 26, -14.5, 'crate2'],
    [3, 2.6, 2.4, -9, -19.5, 'container'], [3, 2.6, 2.4, 9, -19.5, 'container2'],
  ];
  for (const [w, h, d, x, z, m] of cover) box(w, h, d, x, h / 2, z, mat[m]);

  // Neon: light strips along the connector, site pylons and ground rings.
  box(18, 0.12, 0.12, -15, 3.4, -1.78, mat.neon, false);
  box(18, 0.12, 0.12, 15, 3.4, -1.78, mat.neon, false);
  box(18, 0.12, 0.12, -15, 3.4, 1.78, mat.neon, false);
  box(18, 0.12, 0.12, 15, 3.4, 1.78, mat.neon, false);
  for (const [sx, m] of [[-20, 'neonA'], [20, 'neonB']]) {
    box(0.25, 5.5, 0.25, sx - 4.5, 2.75, -16.5, mat[m], false);
    box(0.25, 5.5, 0.25, sx + 4.5, 2.75, -16.5, mat[m], false);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(5, 0.12, 8, 48),
      mat[m],
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(sx, 0.06, -12);
    group.add(ring);
  }

  // Light: a low dusk sun, a cool sky fill, and a warm and a cool site glow.
  scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x1a140f, 0.85));
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.0);
  sun.position.set(18, 26, 14);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x7fa8ff, 0.5);
  fill.position.set(-14, 18, -10);
  scene.add(fill);
  const glowA = new THREE.PointLight(0xff7a1a, 26, 22, 1.8);
  glowA.position.set(-20, 4.5, -12);
  scene.add(glowA);
  const glowB = new THREE.PointLight(0x2dd4bf, 26, 22, 1.8);
  glowB.position.set(20, 4.5, -12);
  scene.add(glowB);

  // The waypoint graph the bots walk. Nodes sit on lanes; edges join neighbours.
  const NODES = {
    atkSpawn: [0, 18], atkWest: [-10, 16], atkEast: [10, 16],
    aLongS: [-24, 14], aLongM: [-24, 4], aLongN: [-24, -6], siteA: [-20, -12],
    bLongS: [24, 14], bLongM: [24, 4], bLongN: [24, -6], siteB: [20, -12],
    midS: [0, 12], midM: [0, 0], midN: [0, -10],
    conW: [-14, 0], conE: [14, 0], conAW: [-22, 0], conEB: [22, 0],
    yardW: [-8, -13], yardE: [8, -13], defSpawn: [0, -18],
    siteAW: [-26, -13], siteAE: [-14, -13], siteBW: [14, -13], siteBE: [26, -13],
  };
  const EDGES = {
    atkSpawn: ['atkWest', 'midS', 'atkEast'],
    atkWest: ['atkSpawn', 'aLongS'], atkEast: ['atkSpawn', 'bLongS'],
    aLongS: ['atkWest', 'aLongM'], aLongM: ['aLongS', 'aLongN', 'conAW'],
    aLongN: ['aLongM', 'siteA'], siteA: ['aLongN', 'yardW', 'siteAW', 'siteAE'],
    bLongS: ['atkEast', 'bLongM'], bLongM: ['bLongS', 'bLongN', 'conEB'],
    bLongN: ['bLongM', 'siteB'], siteB: ['bLongN', 'yardE', 'siteBW', 'siteBE'],
    midS: ['atkSpawn', 'midM'], midM: ['midS', 'midN', 'conW', 'conE'],
    midN: ['midM', 'defSpawn', 'yardW', 'yardE'],
    conW: ['midM', 'conAW'], conE: ['midM', 'conEB'],
    conAW: ['conW', 'aLongM'], conEB: ['conE', 'bLongM'],
    yardW: ['midN', 'defSpawn', 'siteA'], yardE: ['midN', 'defSpawn', 'siteB'],
    defSpawn: ['midN', 'yardW', 'yardE'],
    siteAW: ['siteA'], siteAE: ['siteA'], siteBW: ['siteB'], siteBE: ['siteB'],
  };

  function nearestNode(x, z) {
    let best = 'atkSpawn';
    let bestD = Infinity;
    for (const [id, [nx, nz]] of Object.entries(NODES)) {
      const d = (nx - x) ** 2 + (nz - z) ** 2;
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  // Breadth-first search over the graph; returns the node ids from start to goal.
  function findPath(fromId, toId) {
    if (fromId === toId) return [fromId];
    const prev = { [fromId]: null };
    const queue = [fromId];
    while (queue.length) {
      const current = queue.shift();
      for (const next of EDGES[current] ?? []) {
        if (prev[next] !== undefined) continue;
        prev[next] = current;
        if (next === toId) {
          const path = [next];
          let node = current;
          while (node) { path.unshift(node); node = prev[node]; }
          return path;
        }
        queue.push(next);
      }
    }
    return [fromId, toId];
  }

  const sites = {
    A: { center: new THREE.Vector3(-20, 0, -12), radius: 5 },
    B: { center: new THREE.Vector3(20, 0, -12), radius: 5 },
  };
  const spawns = {
    atk: [[-6, 19], [-3, 18.5], [0, 19.5], [3, 18.5], [6, 19]],
    def: [[-6, -19], [-3, -18.5], [0, -19.5], [3, -18.5], [6, -19]],
  };

  return {
    colliders, shootables, group,
    nodes: NODES, edges: EDGES, nearestNode, findPath,
    sites, spawns,
    bounds: { minX: -30, maxX: 30, minZ: -22, maxZ: 22 },
  };
}
