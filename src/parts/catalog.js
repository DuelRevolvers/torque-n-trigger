// Part catalog: every slot, every part type and its stats at Street quality (x1.00).
// Plain data, shared by the simulation (physics params, stats) and rendering (looks).

export const SLOTS = [
  'chassis', 'engine', 'suspension', 'transmission', 'brakes', 'turbo', 'nitrous', 'cooling',
  'exhaust', 'fuelTank', 'wheels', 'armor', 'primaryWeapon', 'secondaryWeapon', 'utility',
  'interiors', 'bodyKit', 'spoiler', 'lights', 'paint',
];

// A car can't drive without these.
export const REQUIRED_SLOTS = ['chassis', 'engine', 'suspension', 'transmission', 'wheels'];

export const SLOT_NAMES = {
  chassis: 'Chassis', engine: 'Engine', suspension: 'Suspension', transmission: 'Transmission',
  brakes: 'Brakes', turbo: 'Turbo', nitrous: 'Nitrous', cooling: 'Cooling', exhaust: 'Exhaust',
  fuelTank: 'Fuel tank', wheels: 'Wheels', armor: 'Armor', primaryWeapon: 'Primary weapon',
  secondaryWeapon: 'Secondary weapon', utility: 'Utility', interiors: 'Interiors', bodyKit: 'Body kit',
  spoiler: 'Spoiler', lights: 'Lights', paint: 'Paint job',
};

export const QUALITIES = [
  { id: 'junk', name: 'Junk', mult: 0.7, value: 0.4, traits: 0 },
  { id: 'stock', name: 'Stock', mult: 0.85, value: 0.7, traits: 0 },
  { id: 'street', name: 'Street', mult: 1.0, value: 1.0, traits: 1 },
  { id: 'sport', name: 'Sport', mult: 1.15, value: 1.6, traits: 1 },
  { id: 'race', name: 'Race', mult: 1.3, value: 2.5, traits: 1 },
  { id: 'elite', name: 'Elite', mult: 1.45, value: 4.0, traits: 2 },
];
export const QUALITY = Object.fromEntries(QUALITIES.map((q, i) => [q.id, { ...q, rank: i }]));

export const SIZES = { small: 1, medium: 2, large: 3 };

// How strongly quality scales each stat: value * (1 + (mult - 1) * s).
// Inverse stats (lower is better) divide instead. Stats not listed don't scale
// (weight, sizes, gear ratios, looks).
export const SCALING = {
  torque: 1, power: 1, hp: 1, weightCapacity: 0.5, brakeForce: 1, grip: 0.35, handling: 0.35,
  turboBoost: 1, force: 1, charges: 0, heatCapacity: 1, dissipation: 1, armor: 1, damage: 1,
  fireRate: 0.5, range: 0.5, rollCage: 1, controls: 1, electronics: 1, aero: 1, ramDamage: 1,
  downforce: 1, capacity: 1, landing: 0.5, torqueBonus: 1, offroadGrip: 0.35, ammo: 0.5,
};
export const INVERSE_SCALING = { shiftTime: 1, rechargeTime: 1, cooldown: 1, heat: 0.5, heatPerShot: 0.5, reload: 0.5 };

// Street+ parts may roll one trait, Elite parts roll two.
export const TRAITS = {
  lightweight: { name: 'Lightweight', desc: '-8% weight', weightMul: 0.92 },
  overbuilt: { name: 'Overbuilt', desc: '+15% durability', durability: 1.15 },
  tuned: { name: 'Tuned', desc: '+5% performance', perfMul: 1.05 },
  coolRunning: { name: 'Cool-running', desc: '-15% heat', heatMul: 0.85 },
  reinforced: { name: 'Reinforced', desc: '+10% HP', hpMul: 1.1 },
};

// Part types per slot. `value` is the base price at Street quality.
export const PART_TYPES = {
  chassis: {
    hatch: {
      name: 'Compact Hatch', value: 900, size: 'small', hp: 380, weight: 620, weightCapacity: 1150,
      mounts: { engine: 'small', primaryWeapon: 'small', secondaryWeapon: 'small' },
      length: 3.8, width: 1.75, height: 0.95, wheelbase: 2.4, track: 1.5, drag: 0.4, brakeBase: 9000, drive: 'fwd',
    },
    wedge: {
      name: 'Wedge Coupe', value: 1400, size: 'medium', hp: 450, weight: 700, weightCapacity: 1300,
      mounts: { engine: 'medium', primaryWeapon: 'medium', secondaryWeapon: 'small' },
      length: 4.3, width: 1.9, height: 0.9, wheelbase: 2.7, track: 1.64, drag: 0.36, brakeBase: 9000, drive: 'rwd',
    },
    muscle: {
      name: 'Muscle Car', value: 1600, size: 'medium', hp: 520, weight: 820, weightCapacity: 1500,
      mounts: { engine: 'large', primaryWeapon: 'medium', secondaryWeapon: 'medium' },
      length: 4.6, width: 1.95, height: 0.95, wheelbase: 2.8, track: 1.66, drag: 0.44, brakeBase: 9500, drive: 'rwd',
    },
    pickup: {
      name: 'Armored Pickup', value: 1800, size: 'large', hp: 650, weight: 950, weightCapacity: 1750,
      mounts: { engine: 'large', primaryWeapon: 'large', secondaryWeapon: 'medium' },
      length: 4.9, width: 2.0, height: 1.1, wheelbase: 3.0, track: 1.72, drag: 0.52, brakeBase: 10000, drive: 'rwd',
    },
    van: {
      name: 'Cargo Van', value: 1500, size: 'large', hp: 760, weight: 1080, weightCapacity: 1950,
      mounts: { engine: 'medium', primaryWeapon: 'large', secondaryWeapon: 'large' },
      length: 4.8, width: 2.0, height: 1.45, wheelbase: 2.9, track: 1.72, drag: 0.6, brakeBase: 10000, drive: 'rwd',
    },
    buggy: {
      name: 'Hover-kit Buggy', value: 1300, size: 'small', hp: 340, weight: 480, weightCapacity: 1050,
      mounts: { engine: 'medium', primaryWeapon: 'small', secondaryWeapon: 'small' },
      length: 3.6, width: 1.85, height: 0.8, wheelbase: 2.4, track: 1.62, drag: 0.46, brakeBase: 8000, drive: 'awd',
    },
  },
  engine: {
    inline4: { name: 'Inline-4', value: 700, size: 'small', torque: 165, redline: 7600, heat: 0.8, power: 60, weight: 120 },
    v6: { name: 'V6', value: 1100, size: 'medium', torque: 210, redline: 7000, heat: 1.0, power: 80, weight: 170 },
    v8hybrid: { name: 'Kessler V8 Hybrid', value: 1800, size: 'large', torque: 290, redline: 6600, heat: 1.4, power: 110, weight: 250 },
    rotary: { name: 'Rotary', value: 1400, size: 'small', torque: 180, redline: 9000, heat: 1.6, power: 70, weight: 110 },
    magcoil: { name: 'Mag-Coil Electric', value: 1600, size: 'medium', torque: 250, redline: 5800, heat: 0.5, power: 100, weight: 190, curve: 'flat' },
  },
  suspension: {
    street: { name: 'Street Coilovers', value: 500, frequency: 1.45, damping: 0.5, antiRoll: 0.35, handling: 1.0, rest: 0.32, travel: 0.24, landing: 1.0, weight: 60 },
    sport: { name: 'Lowered Sport', value: 800, frequency: 1.75, damping: 0.55, antiRoll: 0.5, handling: 1.08, rest: 0.28, travel: 0.2, landing: 0.8, weight: 55 },
    offroad: { name: 'Long-travel Off-road', value: 700, frequency: 1.2, damping: 0.45, antiRoll: 0.25, handling: 0.92, rest: 0.4, travel: 0.34, landing: 1.3, weight: 80 },
    heavy: { name: 'Heavy-duty Leaf', value: 600, frequency: 1.6, damping: 0.6, antiRoll: 0.45, handling: 0.95, rest: 0.34, travel: 0.24, landing: 1.1, weight: 110, ramResist: 1.3 },
  },
  transmission: {
    four: { name: '4-speed Manual', value: 400, gears: [3.2, 2.0, 1.4, 1.05], finalDrive: 3.9, shiftTime: 0.2, weight: 70 },
    five: { name: '5-speed', value: 700, gears: [3.4, 2.2, 1.6, 1.25, 1.0], finalDrive: 3.9, shiftTime: 0.16, weight: 75 },
    six: { name: '6-speed Sport', value: 1000, gears: [3.6, 2.4, 1.78, 1.38, 1.12, 0.93], finalDrive: 4.0, shiftTime: 0.14, weight: 80 },
    sequential: { name: 'Sequential Race', value: 1600, gears: [3.3, 2.35, 1.8, 1.45, 1.2, 1.0], finalDrive: 3.8, shiftTime: 0.07, weight: 72 },
    drag: { name: 'Drag Close-ratio', value: 1200, gears: [2.9, 2.1, 1.6, 1.28, 1.05], finalDrive: 4.3, shiftTime: 0.09, weight: 78 },
  },
  brakes: {
    drum: { name: 'Drum Brakes', value: 200, brakeForce: 10000, weight: 30 },
    disc: { name: 'Disc Brakes', value: 500, brakeForce: 13000, weight: 34 },
    sport: { name: 'Sport Calipers', value: 900, brakeForce: 15500, weight: 36 },
    ceramic: { name: 'Carbon-Ceramic', value: 1600, brakeForce: 18000, weight: 26 },
  },
  turbo: {
    small: { name: 'Small Turbo', value: 700, turboBoost: 0.18, spoolRpm: 3500, heat: 0.3, weight: 25 },
    big: { name: 'Big Turbo', value: 1200, turboBoost: 0.35, spoolRpm: 4800, heat: 0.6, weight: 40 },
    twin: { name: 'Twin Turbo', value: 1500, turboBoost: 0.28, spoolRpm: 3000, heat: 0.5, weight: 45 },
  },
  nitrous: {
    single: { name: 'Single Bottle', value: 500, charges: 2, force: 3500, duration: 2.0, rechargeTime: 12, weight: 20 },
    dual: { name: 'Dual Bottles', value: 900, charges: 3, force: 4000, duration: 2.0, rechargeTime: 10, weight: 30 },
    directPort: { name: 'Direct-port', value: 1200, charges: 2, force: 6000, duration: 1.5, rechargeTime: 14, weight: 25 },
    cells: { name: 'Boost Cells', value: 1100, charges: 4, force: 3000, duration: 2.0, rechargeTime: 8, weight: 40 },
  },
  cooling: {
    radiator: { name: 'Radiator', value: 300, heatCapacity: 100, dissipation: 1.0, weight: 20 },
    dual: { name: 'Dual Radiator', value: 600, heatCapacity: 130, dissipation: 1.2, weight: 35 },
    cryo: { name: 'Cryo Loop', value: 1100, heatCapacity: 160, dissipation: 1.5, weight: 30 },
  },
  exhaust: {
    straight: { name: 'Straight Pipe', value: 200, torqueBonus: 0.04, dissipation: 0.2, weight: 15, look: 'straight' },
    side: { name: 'Side Pipes', value: 400, torqueBonus: 0.05, dissipation: 0.3, weight: 20, look: 'side' },
    stacks: { name: 'Stacks', value: 500, torqueBonus: 0.06, dissipation: 0.25, weight: 25, look: 'stacks' },
    quad: { name: 'Quad Tips', value: 600, torqueBonus: 0.07, dissipation: 0.2, weight: 30, look: 'quad' },
  },
  fuelTank: {
    cell: { name: 'Racing Cell', value: 300, capacity: 40, weight: 25 },
    standard: { name: 'Standard Tank', value: 200, capacity: 60, weight: 40 },
    longRange: { name: 'Long-range Tank', value: 500, capacity: 90, weight: 65 },
    armored: { name: 'Armored Tank', value: 700, capacity: 60, weight: 70, hp: 60 },
  },
  wheels: {
    street: { name: 'Street Tires', value: 400, grip: 1.2, offroadGrip: 1.0, radius: 0.34, width: 0.26, weight: 80 },
    offroad: { name: 'Off-road Tires', value: 500, grip: 1.1, offroadGrip: 1.3, radius: 0.38, width: 0.32, weight: 100 },
    slick: { name: 'Drag Slicks', value: 700, grip: 1.3, offroadGrip: 0.8, radius: 0.35, width: 0.36, weight: 85 },
    spiked: { name: 'Spiked Wheels', value: 800, grip: 1.12, offroadGrip: 1.15, radius: 0.36, width: 0.3, weight: 110, ramDamage: 20 },
  },
  armor: {
    light: { name: 'Light Plating', value: 500, armor: 0.08, hp: 60, weight: 70 },
    composite: { name: 'Composite Armor', value: 1000, armor: 0.14, hp: 90, weight: 110 },
    heavy: { name: 'Heavy Steel', value: 900, armor: 0.22, hp: 140, weight: 200 },
    reactive: { name: 'Reactive Plates', value: 1400, armor: 0.18, hp: 80, weight: 130 },
  },
  primaryWeapon: {
    chaingun: { name: 'Chain Gun', value: 800, size: 'small', kind: 'ballistic', damage: 8, fireRate: 12, range: 60, ammo: 200, reload: 2.5, powerDraw: 10, weight: 60 },
    scatter: { name: 'Scatter Cannon', value: 900, size: 'medium', kind: 'ballistic', damage: 40, fireRate: 1.5, range: 25, ammo: 24, reload: 3, powerDraw: 10, weight: 90 },
    plasma: { name: 'Plasma Launcher', value: 1200, size: 'medium', kind: 'energy', damage: 35, fireRate: 2, range: 70, heatPerShot: 8, powerDraw: 35, weight: 80 },
    flamethrower: { name: 'Flamethrower', value: 900, size: 'small', kind: 'energy', damage: 3, fireRate: 10, range: 15, heatPerShot: 3, powerDraw: 20, weight: 70 },
    railgun: { name: 'Rail Gun', value: 2000, size: 'large', kind: 'energy', damage: 90, fireRate: 0.5, range: 150, heatPerShot: 25, powerDraw: 60, weight: 120 },
  },
  secondaryWeapon: {
    mines: { name: 'Rear Mines', value: 700, size: 'small', kind: 'ballistic', mount: 'rear', damage: 60, fireRate: 0.5, range: 0, ammo: 6, reload: 6, powerDraw: 5, weight: 50 },
    turret: { name: 'Roof Turret', value: 1100, size: 'medium', kind: 'ballistic', mount: 'roof', damage: 6, fireRate: 8, range: 50, ammo: 150, reload: 3, powerDraw: 25, weight: 70 },
    rockets: { name: 'Side Rockets', value: 1000, size: 'medium', kind: 'ballistic', mount: 'side', damage: 45, fireRate: 1, range: 90, ammo: 8, reload: 5, powerDraw: 15, weight: 80 },
    tesla: { name: 'Tesla Coil', value: 1400, size: 'large', kind: 'energy', mount: 'roof', damage: 20, fireRate: 3, range: 20, heatPerShot: 6, powerDraw: 45, weight: 95 },
  },
  utility: {
    oil: { name: 'Oil Slick', value: 400, cooldown: 12, powerDraw: 5, weight: 20, color: '#303030' },
    smoke: { name: 'Smoke Screen', value: 400, cooldown: 10, powerDraw: 5, weight: 15, color: '#9a9aa8' },
    shield: { name: 'Shield Emitter', value: 1200, cooldown: 18, powerDraw: 40, weight: 35, color: '#05d9e8' },
    repair: { name: 'Repair Kit', value: 900, cooldown: 30, powerDraw: 10, weight: 25, color: '#39ff14' },
  },
  interiors: {
    stripped: { name: 'Stripped Race', value: 300, rollCage: 0.2, controls: 0.06, electronics: 0.0, weight: 15 },
    street: { name: 'Street Interior', value: 300, rollCage: 0.4, controls: 0.03, electronics: 0.05, weight: 45 },
    cage: { name: 'Race Cage', value: 800, rollCage: 0.7, controls: 0.08, electronics: 0.08, weight: 60 },
    armored: { name: 'Armored Cockpit', value: 900, rollCage: 1.0, controls: 0.0, electronics: 0.1, weight: 120 },
  },
  bodyKit: {
    street: { name: 'Street Kit', value: 300, aero: 0.03, ramDamage: 0, weight: 20 },
    aero: { name: 'Aero Kit', value: 700, aero: 0.08, ramDamage: 0, weight: 25 },
    ram: { name: 'Ram Bumper', value: 600, aero: -0.04, ramDamage: 60, weight: 90, ramResist: 1.2 },
    spiked: { name: 'Spiked Kit', value: 500, aero: -0.02, ramDamage: 35, weight: 50 },
  },
  spoiler: {
    lip: { name: 'Lip Spoiler', value: 150, downforce: 0.5, drag: 0.01, weight: 5 },
    mid: { name: 'Mid Wing', value: 400, downforce: 1.2, drag: 0.025, weight: 12 },
    high: { name: 'High Wing', value: 700, downforce: 2.0, drag: 0.04, weight: 18 },
  },
  lights: {
    halogen: { name: 'Halogens', value: 100, visibility: 1.0, underglow: false, weight: 5 },
    neon: { name: 'Neon Underglow', value: 300, visibility: 1.0, underglow: true, weight: 8 },
    strips: { name: 'Light Strips', value: 500, visibility: 1.1, underglow: true, strips: true, weight: 10 },
    lightbar: { name: 'Search Light Bar', value: 600, visibility: 1.5, underglow: false, lightbar: true, weight: 15 },
  },
  paint: {
    gloss: { name: 'Gloss', value: 200, roughness: 0.3, metalness: 0.15, weight: 0 },
    matte: { name: 'Matte', value: 200, roughness: 0.9, metalness: 0.0, weight: 0 },
    metallic: { name: 'Metallic', value: 400, roughness: 0.38, metalness: 0.7, weight: 0 },
    chrome: { name: 'Chrome', value: 900, roughness: 0.08, metalness: 1.0, weight: 0 },
    holo: { name: 'Holographic', value: 1200, roughness: 0.2, metalness: 0.6, weight: 0, holo: true },
  },
};

export const PAINT_COLORS = ['#4a4652', '#c8203c', '#1e4a8a', '#e8e0d0', '#1a1a1e', '#d8a000', '#2a6a3a', '#7a2ab0', '#ff6a1a', '#3a8a9a'];
export const LIGHT_COLORS = ['#05d9e8', '#ff2a6d', '#39ff14', '#ffb000', '#b04dff', '#ffffff'];

export const partType = (part) => PART_TYPES[part.slot][part.type];
export const partName = (part) => `${QUALITY[part.quality].name} ${partType(part).name}`;
export const partValue = (part) => Math.round(partType(part).value * QUALITY[part.quality].value);
