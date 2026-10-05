// Fences and walls placed in a run, post to post, as a road is drawn (the T&T
// SDK's "In a run" placing). The run bends at each post and nowhere else: each
// stretch between two posts is filled with copies of the object, made to fit it
// exactly (an add's len: sim/layoutEdits.js).
import { longSide } from '../sim/layoutEdits.js';

// What can be placed in a run: long, thin things that go on end to end.
const RUN_TYPES = new Set(['fence', 'wall', 'lowWall', 'hedge', 'railing', 'riverWall', 'seawall', 'seaWall', 'balustrade', 'parapet', 'lobbyWall', 'shellWall', 'tunnelWall', 'jersey', 'parkWall', 'gate']);
const RUN_KINDS = new Set(['fence', 'glass']); // (breakables: a picket fence, glass panels)

export function runnable(it) {
  if (!it || !(it.t === 'brk' ? RUN_KINDS.has(it.kind) : RUN_TYPES.has(it.t))) return false;
  const s = longSide(it);
  return !!s && s.len > s.width;
}

// About how long each piece is: the object's own length, kept to 2-8 m (a
// breakable panel breaks on its own; a long wall still follows the ground).
export const pieceLength = (it) => Math.min(8, Math.max(2, longSide(it).len));

// The pieces of a run of `it` through posts ([[x, z], ...]; closed: back round
// to the first). Each stretch is split into pieces about pieceLength long, each
// exactly its share of the stretch. A thick wall's stretch reaches half its
// thickness past a post the run turns at, so the corner is closed.
// [{ x, z, yaw (the turn from the object's own heading), len }].
export function runPieces(it, posts, closed = false) {
  const side = longSide(it);
  const unit = pieceLength(it);
  const n = posts.length;
  const stretches = closed ? n : n - 1;
  const out = [];
  for (let k = 0; k < stretches; k++) {
    const [ax, az] = posts[k];
    const [bx, bz] = posts[(k + 1) % n];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.2) continue;
    const [dx, dz] = [(bx - ax) / L, (bz - az) / L];
    const past = closed || k < stretches - 1 ? side.width / 2 : 0;
    const count = Math.max(1, Math.round((L + past) / unit));
    const len = (L + past) / count;
    const turn = Math.atan2(dx, dz) - side.yaw;
    const yaw = Math.atan2(Math.sin(turn), Math.cos(turn));
    for (let q = 0; q < count; q++) {
      const t = len * (q + 0.5);
      out.push({ x: ax + dx * t, z: az + dz * t, yaw, len });
    }
  }
  return out;
}
