import {
    DRAW_MODES,
    KNOBS,
    knobAt,
    type DrawMode,
    type Knob,
    type PanelParams,
    type Pointer,
    type SketchParams,
} from '../params.ts';
import {
    LATTICES,
    LENSES,
    SPACES,
    orbitUniform,
    projection,
    REFERENCE_DISTANCE,
    wraps,
    type Orbit,
} from '../space.ts';
import { RAMP_SIZE } from '../theme.ts';
import type { Surface } from './surface.ts';
import { createProgram, type ProgramResult } from './program.ts';
import fragmentSource from './shaders/sketch.frag?raw';
import vertexSource from './shaders/sketch.vert?raw';

// The formula is spliced after the prelude, so driver line numbers need rebasing.
const PRELUDE_LINES = vertexSource.split('\n').length;

const NULL_TERMINATOR = /\0/g;
const RETURNS_TINT = /\bvec4\s+formula\s*\(/;
const SCRIPTS_CAMERA = /\bCamera\s+camera\s*\(/;
const PLACES_SAMPLES = /\bvec2\s+lattice\s*\(/;
const MAPS_SPACE = /\bvec3\s+space\s*\(/;
const DECLARES_WRAP = /^\s*#define\s+WRAPS\b/m;
const EVOLVES = /\bvec4\s+evolve\s*\(/;
const SEEDS = /\bvec4\s+initial\s*\(/;
const DECLARES_STEPS = /^\s*#define\s+STEPS\s+(\d+)\b/m;
// `#define K1 feed_rate` names a knob: never expanded, since nothing in GLSL is spelt K1.
const NAMES_KNOB = /^\s*#define\s+K([1-4])\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/gm;

export const knobLabelsOf = (formula: string): Readonly<Record<Knob, string>> => {
    const named = new Map(
        [...formula.matchAll(NAMES_KNOB)].map(([, digit, name]) => [
            `k${digit ?? ''}`,
            (name ?? '').replace(/_/g, ' '),
        ]),
    );

    return {
        k1: named.get('k1') ?? 'k1',
        k2: named.get('k2') ?? 'k2',
        k3: named.get('k3') ?? 'k3',
        k4: named.get('k4') ?? 'k4',
    };
};

export const DEFAULT_STEPS = 60;

// Steps per second of a formula that evolves: its own #define STEPS, kept to what a frame can replay.
const stepsOf = (formula: string): number =>
    Math.min(Math.max(Number(DECLARES_STEPS.exec(formula)?.[1] ?? DEFAULT_STEPS), 1), 1000);

// Appended after the formula, never before it, or every reported line number would shift.
export const adapterFor = (formula: string): string =>
    [
        RETURNS_TINT.test(formula)
            ? 'vec4 point(float x, float y, float t) { return formula(x, y, t); }'
            : 'vec4 point(float x, float y, float t) { vec3 v = formula(x, y, t); return vec4(v, v.z); }',
        SCRIPTS_CAMERA.test(formula)
            ? 'Camera view(float t) { return camera(t); }'
            : 'Camera view(float t) { return Camera(vec3(0.0, 0.0, uReference), vec3(0.0), vec3(0.0, 1.0, 0.0)); }',
        PLACES_SAMPLES.test(formula)
            ? 'vec2 sampled(vec2 uv, float index, float count) { return lattice(uv, index, count); }'
            : 'vec2 sampled(vec2 uv, float index, float count) { return builtinLattice(uv); }',
        MAPS_SPACE.test(formula)
            ? 'vec3 placed(vec3 p) { return space(p); }'
            : 'vec3 placed(vec3 p) { return builtinSpace(p); }',
        `bool ownSpace() { return ${MAPS_SPACE.test(formula) ? 'true' : 'false'}; }`,
        EVOLVES.test(formula)
            ? 'vec4 evolved(float x, float y, float t) { return evolve(x, y, t); }'
            : 'vec4 evolved(float x, float y, float t) { return state(); }',
        SEEDS.test(formula)
            ? 'vec4 seeded(float x, float y) { return initial(x, y); }'
            : 'vec4 seeded(float x, float y) { return vec4(0.0); }',
    ].join('\n');
const LOG_LOCATION = /^(ERROR|WARNING): \d+:(\d+):/gm;

const readableLog = (log: string, offset: number): string =>
    log
        .replace(NULL_TERMINATOR, '')
        .trimEnd()
        .replace(
            LOG_LOCATION,
            (_match: string, level: string, line: string) =>
                `${level} line ${Number(line) - offset}:`,
        );

export type Uniforms = {
    readonly dimension: WebGLUniformLocation | null;
    readonly mode: WebGLUniformLocation | null;
    readonly playhead: WebGLUniformLocation | null;
    readonly depthScalar: WebGLUniformLocation | null;
    readonly baseSize: WebGLUniformLocation | null;
    readonly pixelRatio: WebGLUniformLocation | null;
    readonly dotScale: WebGLUniformLocation | null;
    readonly palette: WebGLUniformLocation | null;
    readonly knobs: readonly (WebGLUniformLocation | null)[];
    readonly pointer: WebGLUniformLocation | null;
    readonly pointerDown: WebGLUniformLocation | null;
    readonly projection: WebGLUniformLocation | null;
    readonly orbit: WebGLUniformLocation | null;
    readonly pass: WebGLUniformLocation | null;
    readonly lens: WebGLUniformLocation | null;
    readonly fade: WebGLUniformLocation | null;
    readonly lattice: WebGLUniformLocation | null;
    readonly space: WebGLUniformLocation | null;
    readonly focus: WebGLUniformLocation | null;
    readonly wrap: WebGLUniformLocation | null;
    readonly reference: WebGLUniformLocation | null;
    readonly state: WebGLUniformLocation | null;
};

export type Sketch = {
    readonly program: WebGLProgram;
    readonly uniforms: Uniforms;
    // A formula whose own lattice() or space() goes around x says so with #define WRAPS.
    readonly wraps: boolean;
    readonly evolves: boolean;
    readonly steps: number;
    readonly knobLabels: Readonly<Record<Knob, string>>;
};

export type SketchResult =
    | { readonly ok: true; readonly sketch: Sketch }
    | { readonly ok: false; readonly message: string };

export const createSketch = (gl: WebGL2RenderingContext, formula: string): SketchResult => {
    const result: ProgramResult = createProgram(
        gl,
        `${vertexSource}\n${formula}\n${adapterFor(formula)}`,
        fragmentSource,
    );

    if (!result.ok) {
        return {
            ok: false,
            message: readableLog(result.message, result.stage === 'vertex' ? PRELUDE_LINES : 0),
        };
    }

    const { program } = result;
    const at = (name: string) => gl.getUniformLocation(program, name);

    return {
        ok: true,
        sketch: {
            program,
            wraps: DECLARES_WRAP.test(formula),
            evolves: EVOLVES.test(formula),
            steps: stepsOf(formula),
            knobLabels: knobLabelsOf(formula),
            uniforms: {
                dimension: at('uDimension'),
                mode: at('uMode'),
                playhead: at('uPlayhead'),
                depthScalar: at('uDepthScalar'),
                baseSize: at('uBaseSize'),
                pixelRatio: at('uPixelRatio'),
                dotScale: at('uDotScale'),
                palette: at('uPalette'),
                knobs: KNOBS.map(at),
                pointer: at('uPointer'),
                pointerDown: at('pointerDown'),
                projection: at('uProjection'),
                orbit: at('uOrbit'),
                pass: at('uPass'),
                lens: at('uLens'),
                fade: at('uFade'),
                lattice: at('uLattice'),
                space: at('uSpace'),
                focus: at('uFocus'),
                wrap: at('uWrap'),
                reference: at('uReference'),
                state: at('uState'),
            },
        },
    };
};

// The linker drops a uniform nothing reads, so a null location means the formula ignores that knob.
export const knobsUsed = ({
    uniforms,
    knobLabels,
}: Sketch): readonly { knob: Knob; label: string }[] =>
    KNOBS.filter((_, index) => (uniforms.knobs[index] ?? null) !== null).map(knob => ({
        knob,
        label: knobLabels[knob],
    }));

const closesSeam = (
    { wraps: declared }: Sketch,
    { lattice, space }: Pick<PanelParams, 'lattice' | 'space'>,
): boolean => declared || wraps(lattice, space);

export const prepare = (
    { gl, palette }: Surface,
    sketch: Sketch,
    params: SketchParams,
    ramp: Uint8Array,
    pixelRatio: number,
    dotScale = 1,
): void => {
    const { program, uniforms } = sketch;
    gl.useProgram(program);

    gl.uniform1i(uniforms.dimension, params.dimension);
    // The index must match the MODE_* defines in both shader stages.
    gl.uniform1i(uniforms.mode, DRAW_MODES.indexOf(params.draw.mode));

    if (params.draw.mode === 'dots') {
        gl.uniform1f(uniforms.depthScalar, params.draw.depthScalar);
        gl.uniform1f(uniforms.baseSize, params.draw.baseSize);
    }
    gl.uniform1f(uniforms.pixelRatio, pixelRatio);
    gl.uniform1f(uniforms.dotScale, dotScale);
    gl.uniform1f(uniforms.reference, REFERENCE_DISTANCE);
    gl.uniform1i(uniforms.lens, LENSES.indexOf(params.lens));
    gl.uniform1i(uniforms.lattice, LATTICES.indexOf(params.lattice));
    gl.uniform1i(uniforms.space, SPACES.indexOf(params.space));
    gl.uniform1f(uniforms.focus, params.focus);
    gl.uniform1i(uniforms.wrap, closesSeam(sketch, params) ? 1 : 0);
    gl.uniformMatrix4fv(
        uniforms.projection,
        false,
        projection(params.width / Math.max(params.height, 1), params.fit, params.lens),
    );

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, palette);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, RAMP_SIZE, 1, gl.RGBA, gl.UNSIGNED_BYTE, ramp);
    gl.uniform1i(uniforms.palette, 0);

    // The backdrop is the ramp's first entry, so a theme owns the whole canvas.
    gl.clearColor((ramp[0] ?? 0) / 255, (ramp[1] ?? 0) / 255, (ramp[2] ?? 0) / 255, 1);

    gl.enable(gl.DEPTH_TEST);
    // Any change of settings starts the trails afresh rather than smearing the old picture into it.
    gl.clear(gl.COLOR_BUFFER_BIT);
};

// A wrapping lattice has one more column of cells: the one that closes the seam.
const vertexCount = (mode: DrawMode, dimension: number, wrap: boolean): number => {
    const side = 2 * dimension;

    switch (mode) {
        case 'dots':
            return side * side;
        case 'lines':
            return side * side * 4;
        case 'surface':
            return (wrap ? side : side - 1) * (side - 1) * 6;
    }
};

const primitive = (gl: WebGL2RenderingContext, mode: DrawMode): number => {
    switch (mode) {
        case 'dots':
            return gl.POINTS;
        case 'lines':
            return gl.LINES;
        case 'surface':
            return gl.TRIANGLES;
    }
};

const PASS_LATTICE = 0;
const PASS_AXES = 1;
const PASS_FADE = 2;
export const PASS_STEP = 3;
export const PASS_SEED = 4;

export const setMoment = (
    gl: WebGL2RenderingContext,
    { uniforms }: Sketch,
    { knobs, motion }: Pick<PanelParams, 'knobs' | 'motion'>,
    playhead: number,
    { x, y, down }: Pointer,
    orbit: Orbit,
): void => {
    gl.uniform1f(uniforms.playhead, playhead);
    // Every frame, not in prepare: a moving knob changes with the playhead, not with its settings.
    KNOBS.forEach((knob, index) => {
        gl.uniform1f(uniforms.knobs[index] ?? null, knobAt(knobs[knob], motion[knob], playhead));
    });
    gl.uniform2f(uniforms.pointer, x, y);
    gl.uniform1f(uniforms.pointerDown, down ? 1 : 0);
    gl.uniform3f(uniforms.orbit, ...orbitUniform(orbit));
};
// Must match axisVertex in sketch.vert: 7 lines of 48 pieces of two vertices, then 12 ticks of two.
const AXIS_VERTICES = 7 * 48 * 2 + 12 * 2;

export const drawFrame = (
    gl: WebGL2RenderingContext,
    sketch: Sketch,
    { draw: { mode }, dimension, axes, trails, knobs, motion, lattice, space }: PanelParams,
    playhead: number,
    pointer: Pointer,
    orbit: Orbit,
): void => {
    const { uniforms } = sketch;
    if (trails > 0) {
        // Fade towards the backdrop instead of clearing; depth must not keep the fade from covering.
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.disable(gl.DEPTH_TEST);
        gl.uniform1i(uniforms.pass, PASS_FADE);
        gl.uniform1f(uniforms.fade, 1 - trails);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.enable(gl.DEPTH_TEST);
    } else {
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    setMoment(gl, sketch, { knobs, motion }, playhead, pointer, orbit);
    gl.uniform1i(uniforms.pass, PASS_LATTICE);
    gl.drawArrays(
        primitive(gl, mode),
        0,
        vertexCount(mode, dimension, closesSeam(sketch, { lattice, space })),
    );

    if (axes) {
        gl.uniform1i(uniforms.pass, PASS_AXES);
        gl.drawArrays(gl.LINES, 0, AXIS_VERTICES);
    }
};
