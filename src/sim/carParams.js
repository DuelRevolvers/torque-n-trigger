// Physics parameters for one car. In M1 these are computed from installed parts
// (engine -> torque curve, transmission -> gears, suspension -> springs, wheels
// and spoiler -> grip, total weight -> mass). For M0 there is one hand-tuned car.
//
// Body frame: +X right, +Y up, -Z forward. The origin is the centre of mass.
export const TEST_CAR = {
  mass: 1200,
  inertia: { x: 1900, y: 2000, z: 800 }, // pitch, yaw, roll
  body: { width: 1.9, height: 0.9, length: 4.3, offsetY: 0.0 },

  wheelRadius: 0.34,
  wheels: [
    { x: -0.82, y: -0.05, z: -1.35, front: true, steer: true, drive: false },
    { x: 0.82, y: -0.05, z: -1.35, front: true, steer: true, drive: false },
    { x: -0.82, y: -0.05, z: 1.35, front: false, steer: false, drive: true },
    { x: 0.82, y: -0.05, z: 1.35, front: false, steer: false, drive: true },
  ],
  suspension: { rest: 0.32, travel: 0.24, stiffness: 26000, damping: 2600, antiRoll: 9000 },
  // Tire forces act at this body-frame height instead of the contact patch, which
  // reduces body roll and keeps the car from tipping over in hard corners.
  tireForceY: -0.15,

  gripFront: 1.2,
  gripRear: 1.4,
  slipPeak: 0.16, // slip angle (rad) at peak lateral grip
  slideGrip: 0.82, // fraction of peak grip kept when sliding past the peak
  lowSpeedSlip: 3, // m/s floor for slip-angle calculation, avoids low-speed jitter
  minLateralRetain: 0.3, // lateral grip kept by a wheel at its longitudinal limit
  handbrakeGrip: 0.55,

  brakeForce: 14000,
  brakeBias: 0.62,
  handbrakeForce: 5000,
  rollingResistance: 45, // N per wheel, constant
  drag: 0.42,
  downforce: 0.8,
  angularDamping: 0.3,
  airLeveling: 3500,
  airDamping: 1200,

  engine: { maxTorque: 205, idleRpm: 1000, launchRpm: 3800, redline: 7200 },
  transmission: {
    gears: [3.6, 2.4, 1.78, 1.38, 1.12, 0.93],
    reverse: 3.4,
    finalDrive: 4.0,
    efficiency: 0.88,
    shiftUpRpm: 6900,
    shiftDownRpm: 3200,
    shiftTime: 0.14,
  },
  maxReverseSpeed: 12,

  steering: {
    max: 0.6, // rad at standstill
    speedFalloff: 12, // m/s; max angle halves at this speed
    rate: 3.2, // rad/s toward target
    returnRate: 5.5, // rad/s back toward centre
    counterSteerAssist: 0.55, // how far wheels auto-align with the direction of travel
    driftAngle: 0.45, // rad; past this slide angle, yaw is progressively damped
    driftDamping: 6,
  },

  nitro: { charges: 3, duration: 2.0, force: 4500, rechargeTime: 10 },
};
