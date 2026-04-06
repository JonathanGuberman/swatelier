export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export function v3(x: number, y: number, z: number): Vec3 {
  return [x, y, z];
}

export function v3add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function v3sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function v3scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function v3cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function v3normalize(a: Vec3): Vec3 {
  const len = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  if (len === 0) return [0, 0, 1];
  return [a[0] / len, a[1] / len, a[2] / len];
}

export function v3len(a: Vec3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

export interface Triangle {
  normal: Vec3;
  v1: Vec3;
  v2: Vec3;
  v3: Vec3;
}

export function makeTriangle(a: Vec3, b: Vec3, c: Vec3): Triangle {
  const normal = v3normalize(v3cross(v3sub(b, a), v3sub(c, a)));
  return { normal, v1: a, v2: b, v3: c };
}
