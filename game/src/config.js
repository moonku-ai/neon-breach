// Every tunable number of the game, in one place: the weapons, the economy, the
// round clock and the bot brains. Nothing else in the code hard-codes a price,
// a damage number or a timer, so the whole balance is readable from this file.

// Weapons. damage is a torso hit at close range; headshots multiply it (see
// HEADSHOT_MULT). spreadStill is the cone half-angle in radians while standing
// still; spreadMove is added in full at full sprint speed. falloff is the range
// in metres past which damage halves. price 0 means the starting weapon.
export const WEAPONS = {
  pistol: {
    name: 'VK-9 Pistol', slot: 0, price: 0, damage: 34, headMult: 4, mag: 12,
    reserve: 48, gap: 0.16, reload: 1.4, spreadStill: 0.004, spreadMove: 0.03,
    recoil: 0.011, falloff: 28, auto: false, range: 90,
    blurb: 'Reliable sidearm. One headshot, one kill up close.',
  },
  smg: {
    name: 'Kestrel SMG', slot: 1, price: 1200, damage: 26, headMult: 3, mag: 30,
    reserve: 120, gap: 0.07, reload: 2.0, spreadStill: 0.008, spreadMove: 0.045,
    recoil: 0.008, falloff: 18, auto: true, range: 70,
    blurb: 'Sprays fast, punishes moving fire. Built for close lanes.',
  },
  rifle: {
    name: 'AR-77 Rifle', slot: 2, price: 2700, damage: 36, headMult: 4, mag: 30,
    reserve: 90, gap: 0.1, reload: 2.2, spreadStill: 0.0025, spreadMove: 0.034,
    recoil: 0.013, falloff: 40, auto: true, range: 110,
    blurb: 'The workhorse. Stop, aim, burst — it rewards discipline.',
  },
  marksman: {
    name: 'Longbow DMR', slot: 3, price: 4750, damage: 110, headMult: 2, mag: 5,
    reserve: 20, gap: 1.15, reload: 3.0, spreadStill: 0.0006, spreadMove: 0.06,
    recoil: 0.045, falloff: 90, auto: false, range: 140,
    blurb: 'One shot, one kill. Right-click to scope; useless on the run.',
  },
};

export const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'marksman'];

// Grenades. A fighter carries at most one of each; G throws the selected one.
export const GRENADES = {
  frag: { name: 'Frag Grenade', price: 300, fuse: 1.4, radius: 7, damage: 120, blurb: 'Cooks 1.4 s, then clears a room.' },
  flash: { name: 'Flashbang', price: 200, fuse: 1.1, radius: 14, blind: 2.2, blurb: 'Blinds anyone looking at it.' },
  smoke: { name: 'Smoke Grenade', price: 300, fuse: 1.2, radius: 3.2, life: 12, blurb: 'Blocks sightlines for 12 s.' },
};

export const ARMOR_PRICE = 650; // Halves every hit's damage while it lasts.
export const ARMOR_REDUCTION = 0.5;

// The economy. CS-style: a win pays far more than a loss, and losing streaks
// pay more each round so a team is never priced out of the game for good.
export const ECONOMY = {
  startMoney: 800,
  win: 3250,
  lossBase: 1900,
  lossStreakStep: 500,
  lossMax: 3400,
  kill: 300,
  plant: 300,
  maxMoney: 16000,
};

// The round clock, in seconds.
export const MATCH = {
  roundsToWin: 5,
  roundTime: 100,
  buyTime: 15,
  roundEndTime: 4,
  plantTime: 3.5,
  defuseTime: 5,
  bombFuse: 40,
  freezeMove: false,
};

// Movement and the body. A fighter is a 0.34 m radius box, 1.72 m tall standing.
export const BODY = {
  radius: 0.34,
  standHeight: 1.72,
  crouchHeight: 1.12,
  standEye: 1.6,
  crouchEye: 1.02,
  walkSpeed: 5.4,
  crouchSpeed: 2.4,
  sneakSpeed: 2.8,
  groundAccel: 42,
  airAccel: 9,
  friction: 9,
  gravity: 20,
  jumpSpeed: 6.2,
  health: 100,
};

// Bot brains: reaction time, aim error and aggression are drawn per bot.
export const BOTS = {
  reactionMin: 0.28,
  reactionMax: 0.55,
  aimErrorBase: 0.012, // radians of cone at 10 m, grows with range and speed
  aimErrorPerMetre: 0.0009,
  burstMin: 2,
  burstMax: 4,
  burstPause: 0.45,
  hearRadius: 26,
  viewDistance: 55,
  viewHalfAngle: 1.15, // radians off the facing direction
  moveSpeed: 4.6,
  names: ['Rook', 'Vex', 'Juno', 'Kade', 'Mira', 'Onyx', 'Sable', 'Pike', 'Wren', 'Dusk'],
};
