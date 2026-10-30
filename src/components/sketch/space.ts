import { clamp } from '../../lib/math.ts';

export type Orbit = {
    readonly yaw: number;
    readonly pitch: number;
    readonly distance: number;
};

export type OrbitAction =
    | { readonly kind: 'turn'; readonly dx: number; readonly dy: number }
    | { readonly kind: 'dolly'; readonly delta: number }
    | { readonly kind: 'reset' };

const FOV = (25 * Math.PI) / 180;
const NEAR = 0.05;
const FAR = 100;
const RADIANS_PER_PIXEL = 0.008;
const PITCH_LIMIT = Math.PI / 2 - 0.01;
const MIN_DISTANCE = 1;
const MAX_DISTANCE = 30;

// Far enough that the z = 0 plane's [-1, 1] square just fills the shorter side.
export const REFERENCE_DISTANCE = 1 / Math.tan(FOV / 2);

export const DEFAULT_ORBIT: Orbit = { yaw: 0, pitch: 0, distance: REFERENCE_DISTANCE };

export const reduceOrbit = (orbit: Orbit, action: OrbitAction): Orbit => {
    switch (action.kind) {
        case 'turn':
            return {
                ...orbit,
                yaw: orbit.yaw - action.dx * RADIANS_PER_PIXEL,
                pitch: clamp(
                    orbit.pitch + action.dy * RADIANS_PER_PIXEL,
                    -PITCH_LIMIT,
                    PITCH_LIMIT,
                ),
            };
        case 'dolly':
            return {
                ...orbit,
                distance: clamp(
                    orbit.distance * Math.exp(action.delta * 0.001),
                    MIN_DISTANCE,
                    MAX_DISTANCE,
                ),
            };
        case 'reset':
            return DEFAULT_ORBIT;
    }
};

// Column-major, as uniformMatrix4fv expects without transposing.
export const projection = (aspect: number): Float32Array => {
    const focal = 1 / Math.tan(FOV / 2);
    const sx = aspect >= 1 ? focal / aspect : focal;
    const sy = aspect >= 1 ? focal : focal * aspect;
    const depth = (FAR + NEAR) / (NEAR - FAR);
    const offset = (2 * FAR * NEAR) / (NEAR - FAR);

    return new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, depth, -1, 0, 0, offset, 0]);
};

// What the shader's orbited() reads: yaw, pitch, and the distance relative to the default.
export const orbitUniform = ({
    yaw,
    pitch,
    distance,
}: Orbit): readonly [number, number, number] => [yaw, pitch, distance / REFERENCE_DISTANCE];
