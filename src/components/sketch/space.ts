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

export const sameOrbit = (a: Orbit, b: Orbit): boolean =>
    a.yaw === b.yaw && a.pitch === b.pitch && a.distance === b.distance;

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
export const FITS = ['contain', 'cover', 'stretch'] as const;

export type Fit = (typeof FITS)[number];

export const isFit = (value: string): value is Fit => FITS.some(fit => fit === value);

const scales = (fit: Fit, aspect: number): readonly [number, number] => {
    const wide = aspect >= 1;

    switch (fit) {
        case 'contain':
            return wide ? [1 / aspect, 1] : [1, aspect];
        case 'cover':
            return wide ? [1, aspect] : [1 / aspect, 1];
        case 'stretch':
            return [1, 1];
    }
};

export const projection = (aspect: number, fit: Fit): Float32Array => {
    const focal = 1 / Math.tan(FOV / 2);
    const [x, y] = scales(fit, aspect);
    const sx = focal * x;
    const sy = focal * y;
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
