import { clamp } from '../lib/math.ts';
import { DEFAULT_ORBIT, reduceOrbit, type Orbit, type OrbitAction } from './sketch/space.ts';
import { isThemeName, type ThemeName } from './sketch/themes/registry.ts';

export const SHAPES = ['sphere', 'box', 'torus', 'cylinder', 'plane', 'code'] as const;
export type Shape = (typeof SHAPES)[number];
export const isShape = (value: string): value is Shape => SHAPES.some(shape => shape === value);

export const MATERIALS = ['matte', 'gloss', 'metal', 'glass', 'light'] as const;
export type Material = (typeof MATERIALS)[number];
export const isMaterial = (value: string): value is Material =>
    MATERIALS.some(material => material === value);

export const SCENE_KNOBS = ['k1', 'k2', 'k3', 'k4'] as const;
export type SceneKnob = (typeof SCENE_KNOBS)[number];
export const isSceneKnob = (value: string): value is SceneKnob =>
    SCENE_KNOBS.some(knob => knob === value);

export const MAX_OBJECTS = 16;

type Range = { readonly min: number; readonly max: number; readonly step: number };

const range = (min: number, max: number, step: number): Range => ({ min, max, step });

export const OBJECT_FIELDS = {
    x: range(-4, 4, 0.01),
    y: range(-4, 4, 0.01),
    z: range(-4, 4, 0.01),
    size: range(0.05, 4, 0.01),
    turn: range(0, 1, 0.01),
    tint: range(0, 1, 0.01),
    rough: range(0, 1, 0.01),
    glow: range(0, 20, 0.1),
} as const satisfies Record<string, Range>;
export type ObjectField = keyof typeof OBJECT_FIELDS;
export const OBJECT_FIELD_NAMES = [
    'x',
    'y',
    'z',
    'size',
    'turn',
    'tint',
    'rough',
    'glow',
] as const satisfies readonly ObjectField[];
// Not `in`: a name from storage could be "constructor", which every object has.
export const isObjectField = (value: string): value is ObjectField =>
    OBJECT_FIELD_NAMES.some(name => name === value);

export const SCENE_FIELDS = {
    sun: range(0, 1, 0.01),
    height: range(0, 1, 0.01),
    light: range(0, 8, 0.05),
    sky: range(0, 2, 0.01),
    bounces: range(1, 8, 1),
    exposure: range(-3, 3, 0.1),
    preview: range(1, 1024, 1),
    export: range(1, 256, 1),
    fov: range(15, 100, 1),
} as const satisfies Record<string, Range>;
export type SceneField = keyof typeof SCENE_FIELDS;
export const SCENE_FIELD_NAMES = [
    'sun',
    'height',
    'light',
    'sky',
    'bounces',
    'exposure',
    'preview',
    'export',
    'fov',
] as const satisfies readonly SceneField[];
export const isSceneField = (value: string): value is SceneField =>
    SCENE_FIELD_NAMES.some(name => name === value);

export type SceneObject = {
    readonly id: string;
    readonly shape: Shape;
    readonly material: Material;
} & Readonly<Record<ObjectField, number>>;

export type Scene = {
    readonly objects: readonly SceneObject[];
    readonly code: string;
    readonly knobs: Readonly<Record<SceneKnob, number>>;
    readonly theme: ThemeName;
    readonly orbit: Orbit;
    readonly sources: Readonly<Record<SceneKnob, string | null>>;
} & Readonly<Record<SceneField, number>>;

export const sceneObject = (
    id: string,
    shape: Shape,
    material: Material,
    fields: Partial<Record<ObjectField, number>>,
): SceneObject => ({
    id,
    shape,
    material,
    x: 0,
    y: 0,
    z: 0,
    size: 1,
    turn: 0,
    tint: 0.6,
    rough: 0.3,
    glow: 0,
    ...fields,
});

export const defaultScene: Scene = {
    objects: [
        sceneObject('floor', 'plane', 'matte', { tint: 0.35, rough: 1 }),
        sceneObject('ball', 'sphere', 'glass', { x: -0.7, y: 0.5, size: 0.5, tint: 1, rough: 0 }),
        sceneObject('ring', 'torus', 'metal', {
            x: 0.75,
            y: 0.35,
            size: 0.45,
            turn: 0.15,
            tint: 0.8,
            rough: 0.15,
        }),
        sceneObject('lamp', 'box', 'light', { y: 2.6, size: 0.6, tint: 1, glow: 6 }),
    ],
    code: '',
    sun: 0.15,
    height: 0.55,
    light: 2.5,
    sky: 0.8,
    bounces: 4,
    exposure: 0,
    preview: 256,
    fov: 25,
    export: 64,
    knobs: { k1: 0.5, k2: 0.5, k3: 0.5, k4: 0.5 },
    theme: 'dusk',
    orbit: DEFAULT_ORBIT,
    sources: { k1: null, k2: null, k3: null, k4: null },
};

const fitted = ({ min, max, step }: Range, value: number) => {
    const inside = clamp(value, min, max);

    return step >= 1 ? Math.round(inside) : inside;
};

export type SceneCommand =
    | { readonly kind: 'add'; readonly shape: Shape }
    | { readonly kind: 'remove'; readonly id: string }
    | {
          readonly kind: 'object';
          readonly id: string;
          readonly field: ObjectField;
          readonly value: number;
      }
    | { readonly kind: 'shape'; readonly id: string; readonly shape: Shape }
    | { readonly kind: 'material'; readonly id: string; readonly material: Material }
    | { readonly kind: 'set'; readonly field: SceneField; readonly value: number }
    | { readonly kind: 'knob'; readonly knob: SceneKnob; readonly value: number }
    | { readonly kind: 'theme'; readonly theme: ThemeName }
    | { readonly kind: 'code'; readonly code: string }
    | { readonly kind: 'orbit'; readonly action: OrbitAction }
    | { readonly kind: 'load'; readonly scene: Omit<Scene, 'sources'> }
    | { readonly kind: 'source'; readonly param: SceneKnob; readonly source: string | null };

const withObject = (scene: Scene, id: string, change: (old: SceneObject) => SceneObject) => {
    const found = scene.objects.find(each => each.id === id);
    const changed = found === undefined ? found : change(found);

    return changed === found || changed === undefined
        ? scene
        : { ...scene, objects: scene.objects.map(each => (each.id === id ? changed : each)) };
};

// Ids from the log's sequence, never a count of the objects: a replay without an earlier step must name them alike.
export const reduceScene = (
    scene: Scene,
    command: SceneCommand,
    logged: { readonly seq: number } = { seq: scene.objects.length },
): Scene => {
    switch (command.kind) {
        case 'add':
            return scene.objects.length >= MAX_OBJECTS
                ? scene
                : {
                      ...scene,
                      objects: [
                          ...scene.objects,
                          sceneObject(`object-${logged.seq}`, command.shape, 'matte', {
                              y: command.shape === 'plane' ? 0 : 0.5,
                              size: command.shape === 'plane' ? 1 : 0.5,
                          }),
                      ],
                  };
        case 'remove':
            return scene.objects.some(each => each.id === command.id)
                ? { ...scene, objects: scene.objects.filter(each => each.id !== command.id) }
                : scene;
        case 'object': {
            const value = fitted(OBJECT_FIELDS[command.field], command.value);

            return Number.isFinite(command.value)
                ? withObject(scene, command.id, old =>
                      old[command.field] === value ? old : { ...old, [command.field]: value },
                  )
                : scene;
        }
        case 'shape':
            return withObject(scene, command.id, old =>
                old.shape === command.shape ? old : { ...old, shape: command.shape },
            );
        case 'material':
            return withObject(scene, command.id, old =>
                old.material === command.material ? old : { ...old, material: command.material },
            );
        case 'set': {
            const value = fitted(SCENE_FIELDS[command.field], command.value);

            return !Number.isFinite(command.value) || scene[command.field] === value
                ? scene
                : { ...scene, [command.field]: value };
        }
        case 'knob': {
            const value = clamp(command.value, 0, 1);

            return !Number.isFinite(command.value) || scene.knobs[command.knob] === value
                ? scene
                : { ...scene, knobs: { ...scene.knobs, [command.knob]: value } };
        }
        case 'theme':
            return command.theme === scene.theme ? scene : { ...scene, theme: command.theme };
        case 'code':
            return command.code === scene.code ? scene : { ...scene, code: command.code };
        case 'orbit':
            return { ...scene, orbit: reduceOrbit(scene.orbit, command.action) };
        case 'load':
            return { ...command.scene, sources: scene.sources };
        case 'source':
            return scene.sources[command.param] === command.source
                ? scene
                : { ...scene, sources: { ...scene.sources, [command.param]: command.source } };
    }
};

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

const numberIn = (value: object, key: string, spec: Range, fallback: number) => {
    const read = field(value, key);

    return typeof read === 'number' && Number.isFinite(read) ? fitted(spec, read) : fallback;
};

const parseObject = (value: unknown): SceneObject | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const id = field(value, 'id');
    const shape = field(value, 'shape');
    const material = field(value, 'material');

    if (typeof id !== 'string' || typeof shape !== 'string' || !isShape(shape)) {
        return null;
    }

    const base = sceneObject(
        id,
        shape,
        typeof material === 'string' && isMaterial(material) ? material : 'matte',
        {},
    );

    return OBJECT_FIELD_NAMES.reduce(
        (made, key) => ({
            ...made,
            [key]: numberIn(value, key, OBJECT_FIELDS[key], base[key]),
        }),
        base,
    );
};

const pickedFields = (value: object): Readonly<Record<SceneField, number>> => {
    const read = (key: SceneField) => numberIn(value, key, SCENE_FIELDS[key], defaultScene[key]);

    return {
        sun: read('sun'),
        height: read('height'),
        light: read('light'),
        sky: read('sky'),
        bounces: read('bounces'),
        exposure: read('exposure'),
        preview: read('preview'),
        export: read('export'),
        fov: read('fov'),
    };
};

export const parseScene = (value: unknown): Scene => {
    if (typeof value !== 'object' || value === null) {
        return defaultScene;
    }

    const objects = field(value, 'objects');
    const code = field(value, 'code');
    const knobs = field(value, 'knobs');
    const theme = field(value, 'theme');
    const orbit = field(value, 'orbit');
    const sources = field(value, 'sources');
    const knob = (name: SceneKnob) =>
        typeof knobs === 'object' && knobs !== null
            ? numberIn(knobs, name, range(0, 1, 0.01), defaultScene.knobs[name])
            : defaultScene.knobs[name];
    const source = (name: SceneKnob) => {
        const read = typeof sources === 'object' && sources !== null ? field(sources, name) : null;

        return typeof read === 'string' ? read : null;
    };
    const orbitNumber = (key: keyof Orbit) => {
        const read = typeof orbit === 'object' && orbit !== null ? field(orbit, key) : undefined;

        return typeof read === 'number' && Number.isFinite(read) ? read : DEFAULT_ORBIT[key];
    };
    const parsed = Array.isArray(objects)
        ? objects
              .map(parseObject)
              .filter((each): each is SceneObject => each !== null)
              .filter((each, index, all) => all.findIndex(other => other.id === each.id) === index)
              .slice(0, MAX_OBJECTS)
        : defaultScene.objects;

    return {
        ...pickedFields(value),
        objects: parsed,
        code: typeof code === 'string' ? code : '',
        knobs: { k1: knob('k1'), k2: knob('k2'), k3: knob('k3'), k4: knob('k4') },
        theme: typeof theme === 'string' && isThemeName(theme) ? theme : defaultScene.theme,
        orbit: {
            yaw: orbitNumber('yaw'),
            pitch: orbitNumber('pitch'),
            distance: orbitNumber('distance'),
        },
        sources: { k1: source('k1'), k2: source('k2'), k3: source('k3'), k4: source('k4') },
    };
};

const SHAPE_INDEX = new Map(SHAPES.map((shape, index) => [shape, index]));
const MATERIAL_INDEX = new Map(MATERIALS.map((material, index) => [material, index]));

export const OBJECT_VEC4S = 3;

export const objectUniforms = (objects: readonly SceneObject[]): Float32Array =>
    Float32Array.from(
        objects
            .slice(0, MAX_OBJECTS)
            .flatMap(each => [
                each.x,
                each.y,
                each.z,
                each.size,
                SHAPE_INDEX.get(each.shape) ?? 0,
                MATERIAL_INDEX.get(each.material) ?? 0,
                each.tint,
                each.rough,
                each.turn,
                each.glow,
                0,
                0,
            ]),
    );

const DEFINES_CUSTOM = /\bfn\s+custom\s*\(/;
const SCRIPTS_CAMERA = /\bfn\s+camera\s*\(/;
const BOUNDS_LIGHT = /\bfn\s+bounds\s*\(/;

export const definesCustom = (code: string): boolean => DEFINES_CUSTOM.test(code);

const SHAPE_CODE: Readonly<Record<Shape, (place: string, local: string) => string>> = {
    sphere: place => `sdSphere(p - ${place}.xyz, ${place}.w)`,
    box: (place, local) => `sdBox(${local}, vec3f(${place}.w))`,
    torus: (place, local) => `sdTorus(${local}, ${place}.w, ${place}.w * 0.3)`,
    cylinder: (place, local) => `sdCylinder(${local}, ${place}.w * 0.5, ${place}.w)`,
    plane: place => `p.y - ${place}.y`,
    code: () => '',
};

// One block per object with its shape's own function: a loop that branches on the shape at every step cost the GPU more than the shapes did.
export const objectsCode = (shapes: readonly Shape[]): string =>
    [
        'fn objectsAt(p: vec3f, t: f32) -> Hit {',
        '    var best = Hit(1e9, MATTE, 0.0, 1.0, 0.0);',
        '    var each: Hit;',
        '    nearest = -1;',
        ...shapes.slice(0, MAX_OBJECTS).flatMap((shape, index) => {
            const place = `objects[${index * OBJECT_VEC4S}]`;
            const look = `objects[${index * OBJECT_VEC4S + 1}]`;
            const more = `objects[${index * OBJECT_VEC4S + 2}]`;
            const local = `turned(p - ${place}.xyz, ${more}.x)`;

            return [
                shape === 'code'
                    ? `    each = codeAt(${local}, ${place}.w, t);`
                    : `    each = Hit(${SHAPE_CODE[shape](place, local)}, i32(${look}.y + 0.5), ${look}.z, ${look}.w, ${more}.y);`,
                `    if (each.d < best.d) { best = each; nearest = ${index}; }`,
            ];
        }),
        '    return best;',
        '}',
    ].join('\n');

const SAMPLED_SHAPES: readonly Shape[] = ['sphere', 'box', 'torus', 'cylinder'];

export const lightsOf = ({ objects, code }: Pick<Scene, 'objects' | 'code'>): readonly number[] =>
    objects
        .slice(0, MAX_OBJECTS)
        .flatMap((each, index) =>
            (each.material === 'light' && SAMPLED_SHAPES.includes(each.shape)) ||
            (each.shape === 'code' && BOUNDS_LIGHT.test(code))
                ? [index]
                : [],
        );

// Appended after the code, never before it, or every reported line number would shift.
export const sceneAdapter = (code: string, shapes: readonly Shape[] = []): string =>
    [
        DEFINES_CUSTOM.test(code)
            ? 'fn customHit(p: vec3f, t: f32) -> Hit { return custom(p, t); }'
            : 'fn customHit(p: vec3f, t: f32) -> Hit { return hit(sdSphere(p, 1.0), MATTE, 0.6, 0.5); }',
        SCRIPTS_CAMERA.test(code)
            ? 'fn view(t: f32) -> Camera { return camera(t); }'
            : 'fn view(t: f32) -> Camera { return Camera(vec3f(0.0, 2.4, 7.5), vec3f(0.0, 0.5, 0.0), vec3f(0.0, 1.0, 0.0)); }',
        BOUNDS_LIGHT.test(code)
            ? 'fn codeBounds(t: f32) -> vec4f { return bounds(t); }'
            : 'fn codeBounds(t: f32) -> vec4f { return vec4f(0.0); }',
        objectsCode(shapes),
    ].join('\n');
