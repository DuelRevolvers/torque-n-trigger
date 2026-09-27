// Global simulation constants. The simulation always advances in fixed steps of
// SIM_DT, independent of the render frame rate, so it can be replayed and synced.
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
// Vehicle physics runs several substeps per tick for stiff suspension springs.
export const PHYSICS_SUBSTEPS = 2;
export const GRAVITY = 9.81;
