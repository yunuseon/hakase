import { defaultScene, sceneObject, type Scene } from './scene.ts';

export type SceneContent = Omit<Scene, 'sources'>;

export type SceneExample = {
    readonly label: string;
    readonly summary: string;
    readonly scene: SceneContent;
};

const BLOBS = `Hit custom(vec3 p, float t) {
    float a = t * 6.2832;
    float soft = 0.2 + 0.4 * k1;
    float d = sdSphere(p - vec3(0.6 * sin(a), 0.0, 0.0), 0.45);
    d = smin(d, sdSphere(p - vec3(-0.5 * cos(a), 0.35 * sin(2.0 * a), 0.2), 0.38), soft);
    d = smin(d, sdSphere(p - vec3(0.0, 0.45 * cos(a), -0.4 * sin(a)), 0.32), soft);
    return hit(d, GLOSS, 0.75, 0.15);
}
`;

const ROOM = `Hit custom(vec3 p, float t) {
    Hit room = hit(p.y, MATTE, 0.6, 1.0);
    room = closer(room, hit(3.0 - p.y, MATTE, 0.6, 1.0));
    room = closer(room, hit(p.z + 1.5, MATTE, 0.6, 1.0));
    room = closer(room, hit(p.x + 1.5, MATTE, 0.95, 1.0));
    return closer(room, hit(1.5 - p.x, MATTE, 0.3, 1.0));
}

Camera camera(float t) {
    return Camera(vec3(0.0, 1.5, 9.0), vec3(0.0, 1.3, 0.0), vec3(0.0, 1.0, 0.0));
}
`;

const INTERIOR = `Hit custom(vec3 p, float t) {
    Hit room = hit(p.y, GLOSS, 0.45, 0.35);
    room = closer(room, hit(3.0 - p.y, MATTE, 0.0, 1.0));
    room = closer(room, hit(p.z + 3.2, MATTE, 0.08, 1.0));
    room = closer(room, hit(3.2 - p.z, MATTE, 0.08, 1.0));
    room = closer(room, hit(p.x + 2.5, MATTE, 1.0, 1.0));
    return closer(room, hit(2.5 - p.x, MATTE, 0.08, 1.0));
}

Camera camera(float t) {
    return Camera(vec3(0.3, 1.5, 3.0), vec3(0.153, 1.323, 1.822), vec3(0.0, 1.0, 0.0));
}
`;

const CHECKER = `Hit custom(vec3 p, float t) {
    float check = mod(floor(p.x * 2.0) + floor(p.z * 2.0), 2.0);
    return hit(p.y, MATTE, 0.3 + 0.6 * check, 1.0);
}
`;

const FIELD = `Hit custom(vec3 p, float t) {
    vec2 cell = floor((p.xz + 1.0) / 2.0);
    vec3 q = vec3(mod(p.x + 1.0, 2.0) - 1.0, p.y, mod(p.z + 1.0, 2.0) - 1.0);
    float bob = 0.25 * sin(6.2832 * t + cell.x * 1.3 + cell.y * 0.7);
    return hit(sdSphere(q - vec3(0.0, 0.6 + bob, 0.0), 0.45), METAL, 0.7, 0.05 + 0.4 * k1);
}
`;

const lit = { sun: 0.15, height: 0.55, light: 2.5, sky: 0.8 };

export const SCENE_EXAMPLES = {
    still: {
        label: 'Still life',
        summary: 'A glass ball, a metal ring and a lamp over a matte floor: objects only, no code.',
        scene: defaultScene,
    },
    blobs: {
        label: 'Blobs',
        summary:
            'Three spheres melted together in code with smin, circling over the loop. k1 is how soft they merge.',
        scene: {
            ...defaultScene,
            ...lit,
            objects: [
                sceneObject('floor', 'plane', 'matte', { tint: 0.4, rough: 1 }),
                sceneObject('blobs', 'code', 'gloss', { y: 0.8 }),
            ],
            code: BLOBS,
            theme: 'ember',
        },
    },
    room: {
        label: 'Room',
        summary:
            'A box room lit only by a panel in its ceiling, with two walls of different colours bleeding onto the floor. The walls and the camera are code.',
        scene: {
            ...defaultScene,
            sun: 0,
            height: 0.55,
            light: 0,
            sky: 0,
            bounces: 5,
            exposure: 0.4,
            objects: [
                sceneObject('room', 'code', 'matte', {}),
                sceneObject('panel', 'box', 'light', { y: 3.2, size: 0.35, tint: 1, glow: 14 }),
                sceneObject('block', 'box', 'matte', {
                    x: -0.55,
                    y: 0.45,
                    z: -0.4,
                    size: 0.45,
                    turn: 0.1,
                    tint: 0.7,
                    rough: 1,
                }),
                sceneObject('ball', 'sphere', 'glass', {
                    x: 0.6,
                    y: 0.45,
                    z: 0.3,
                    size: 0.45,
                    tint: 1,
                    rough: 0,
                }),
            ],
            code: ROOM,
            theme: 'ember',
        },
    },
    interior: {
        label: 'Interior',
        summary:
            'Standing inside a closed room lit by a wide ceiling panel and a glowing orb: soft shadows, light bouncing off a coloured wall, and a glossy floor that catches it all.',
        scene: {
            ...defaultScene,
            sun: 0,
            height: 0.55,
            light: 0,
            sky: 0,
            bounces: 6,
            exposure: 0,
            preview: 512,
            fov: 62,
            objects: [
                sceneObject('room', 'code', 'matte', {}),
                sceneObject('panel', 'box', 'light', {
                    y: 3.55,
                    z: -0.8,
                    size: 0.65,
                    tint: 0,
                    glow: 9,
                }),
                sceneObject('orb', 'sphere', 'light', {
                    x: -1.8,
                    y: 1.5,
                    z: -2.4,
                    size: 0.22,
                    tint: 0.6,
                    glow: 16,
                }),
                sceneObject('ball', 'sphere', 'glass', {
                    x: 0.7,
                    y: 0.5,
                    z: -1.2,
                    size: 0.5,
                    tint: 1,
                    rough: 0,
                }),
                sceneObject('ring', 'torus', 'metal', {
                    x: -0.7,
                    y: 0.13,
                    z: -0.5,
                    size: 0.4,
                    tint: 0.8,
                    rough: 0.2,
                }),
                sceneObject('block', 'box', 'matte', {
                    x: 1.5,
                    y: 0.45,
                    z: -2.4,
                    size: 0.45,
                    turn: 0.12,
                    tint: 0.6,
                    rough: 1,
                }),
            ],
            code: INTERIOR,
            theme: 'paper',
        },
    },
    lens: {
        label: 'Lens',
        summary:
            'A large glass ball over a checker floor written in code: the floor seen through the ball is flipped and bent.',
        scene: {
            ...defaultScene,
            sun: 0.3,
            height: 0.7,
            light: 2.5,
            sky: 1,
            objects: [
                sceneObject('floor', 'code', 'matte', {}),
                sceneObject('lens', 'sphere', 'glass', { y: 0.8, size: 0.8, tint: 1, rough: 0 }),
            ],
            code: CHECKER,
            theme: 'ice',
        },
    },
    field: {
        label: 'Field',
        summary:
            'One sphere in code, repeated across the ground with mod and bobbing out of step. k1 is how rough the metal is.',
        scene: {
            ...defaultScene,
            sun: 0.1,
            height: 0.3,
            light: 3,
            sky: 1.6,
            exposure: 0.8,
            objects: [
                sceneObject('floor', 'plane', 'gloss', { tint: 0.3, rough: 0.6 }),
                sceneObject('field', 'code', 'metal', {}),
            ],
            code: FIELD,
            theme: 'dusk',
        },
    },
} as const satisfies Record<string, SceneExample>;

export type SceneExampleName = keyof typeof SCENE_EXAMPLES;

export const SCENE_EXAMPLE_NAMES = [
    'still',
    'blobs',
    'room',
    'interior',
    'lens',
    'field',
] as const satisfies readonly SceneExampleName[];

export const isSceneExample = (value: string): value is SceneExampleName =>
    SCENE_EXAMPLE_NAMES.some(name => name === value);
