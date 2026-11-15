// The minimap: a top-down canvas in the HUD's corner. The static layer (floor,
// walls, site rings) is painted once to an offscreen canvas; each frame only
// the dots move: the player as a white arrow, allies as orange dots, the bomb
// as a red blink when it is down. Enemies never show — you have to spot them.
export function createMinimap(map) {
  const canvas = document.getElementById('minimap');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const { minX, maxX, minZ, maxZ } = map.bounds;
  const scaleX = W / (maxX - minX);
  const scaleZ = H / (maxZ - minZ);

  const px = (x) => (x - minX) * scaleX;
  const pz = (z) => (z - minZ) * scaleZ;

  // Static layer, painted once.
  const staticLayer = document.createElement('canvas');
  staticLayer.width = W;
  staticLayer.height = H;
  const s = staticLayer.getContext('2d');
  s.fillStyle = '#12161d';
  s.fillRect(0, 0, W, H);
  s.fillStyle = '#2a3342';
  for (const box of map.colliders) {
    if (box.max.y < 1) continue; // the floor and low crates stay off the map
    s.fillRect(px(box.min.x), pz(box.min.z), (box.max.x - box.min.x) * scaleX, (box.max.z - box.min.z) * scaleZ);
  }
  s.strokeStyle = '#ff7a1a';
  s.lineWidth = 1.5;
  s.beginPath();
  s.arc(px(map.sites.A.center.x), pz(map.sites.A.center.z), map.sites.A.radius * scaleX, 0, Math.PI * 2);
  s.stroke();
  s.strokeStyle = '#2dd4bf';
  s.beginPath();
  s.arc(px(map.sites.B.center.x), pz(map.sites.B.center.z), map.sites.B.radius * scaleX, 0, Math.PI * 2);
  s.stroke();
  s.fillStyle = '#93a0b1';
  s.font = 'bold 10px monospace';
  s.fillText('A', px(map.sites.A.center.x) - 3, pz(map.sites.A.center.z) + 3);
  s.fillText('B', px(map.sites.B.center.x) - 3, pz(map.sites.B.center.z) + 3);

  function draw(state) {
    ctx.drawImage(staticLayer, 0, 0);
    const player = state.fighters[0];
    // Allies (bots) as dots, enemies never.
    for (const fighter of state.fighters) {
      if (!fighter.alive || fighter === player) continue;
      if (fighter.team !== 'atk') continue;
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath();
      ctx.arc(px(fighter.position.x), pz(fighter.position.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // The bomb: red when dropped or planted, on the carrier otherwise.
    const bomb = state.bomb;
    let bx = null;
    let bz = null;
    if (bomb.state === 'dropped' || bomb.state === 'planted') {
      bx = bomb.position.x;
      bz = bomb.position.z;
    } else if (bomb.carrier) {
      bx = bomb.carrier.position.x;
      bz = bomb.carrier.position.z;
    }
    if (bx !== null) {
      const blink = bomb.state === 'planted' ? (Math.sin(state.time * 6) > 0 ? 1 : 0.3) : 1;
      ctx.fillStyle = `rgba(239, 68, 68, ${blink})`;
      ctx.beginPath();
      ctx.arc(px(bx), pz(bz), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: a white arrow pointing where they face.
    if (player) {
      const x = px(player.position.x);
      const z = pz(player.position.z);
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw)) + Math.PI / 2);
      ctx.fillStyle = '#ece9e2';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  return { draw };
}
