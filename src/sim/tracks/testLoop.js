// M0 test circuit: a ~1.2 km loop with a long start straight, a climbing
// sweeper over a crest, an S-section and a long left-hander back to the line.
// Control points are [x, y, z]; the car starts heading toward -Z.
export const TEST_LOOP = {
  name: 'Test Loop',
  closed: true,
  halfWidth: 8,
  curbWidth: 1.2,
  shoulderWidth: 4,
  points: [
    [0, 0, 120],
    [0, 0, 0],
    [0, 0.5, -120],
    [15, 2, -200],
    [70, 5, -250],
    [150, 8, -255],
    [215, 7, -215],
    [230, 5, -150],
    [190, 3, -110],
    [150, 2, -60],
    [170, 1, 10],
    [230, 0, 60],
    [220, 0, 140],
    [160, 0, 190],
    [80, 0, 200],
    [25, 0, 175],
  ],
};
