import { BUFFER, STAGE } from '../../../lib/gpu.ts';
import { KNOBS, type Knob } from '../../../model/sketch/params.ts';
import sketchSource from './shaders/sketch.wgsl?raw';

const PRELUDE = sketchSource.trimEnd();
// The formula is spliced after the prelude, so compiler line numbers need rebasing.
const PRELUDE_LINES = PRELUDE.split('\n').length;

const RETURNS_TINT = /\bfn\s+formula\s*\([^)]*\)\s*->\s*vec4/;
const SCRIPTS_CAMERA = /\bfn\s+camera\s*\(/;
const PLACES_SAMPLES = /\bfn\s+lattice\s*\(/;
const MAPS_SPACE = /\bfn\s+space\s*\(/;
const DECLARES_WRAP = /^\s*const\s+WRAPS\s*(?::\s*bool\s*)?=\s*true\s*;/m;
const EVOLVES = /\bfn\s+evolve\s*\(/;
const SEEDS = /\bfn\s+initial\s*\(/;
const DECLARES_STEPS = /^\s*const\s+STEPS\s*(?::\s*\w+\s*)?=\s*(\d+)/m;
const NAMES_KNOB = /^\s*\/\/\s*k([1-4])\s*:\s*(\S.*?)\s*$/gm;

export const evolves = (formula: string): boolean => EVOLVES.test(formula);

const IN_GLSL =
    /(^\s*#define\b)|\b(vec[234]|float|void|Hit|Camera)\s+(formula|custom|camera|evolve|initial|lattice|space|bounds)\s*\(/m;

// Saved before formulas moved to WGSL: kept as written, and said so, rather than buried under WGSL's errors.
export const writtenInGlsl = (code: string): boolean => IN_GLSL.test(code.replace(/\/\/.*$/gm, ''));

export const GLSL_MESSAGE =
    'This was written in GLSL, before formulas moved to WGSL. Your text is kept as it was: rewrite it in WGSL and it runs again. The guide above shows the differences, and every built-in formula is an example.';

export const knobLabelsOf = (formula: string): Readonly<Record<Knob, string>> => {
    const named = new Map(
        [...formula.matchAll(NAMES_KNOB)].map(([, digit, name]) => [`k${digit ?? ''}`, name ?? '']),
    );

    return {
        k1: named.get('k1') ?? 'k1',
        k2: named.get('k2') ?? 'k2',
        k3: named.get('k3') ?? 'k3',
        k4: named.get('k4') ?? 'k4',
    };
};

export const DEFAULT_STEPS = 60;

// Steps per second of a formula that evolves: its own const STEPS, kept to what a frame can replay.
export const stepsOf = (formula: string): number =>
    Math.min(Math.max(Number(DECLARES_STEPS.exec(formula)?.[1] ?? DEFAULT_STEPS), 1), 1000);

export const declaresWrap = (formula: string): boolean => DECLARES_WRAP.test(formula);

// Appended after the formula, never before it, or every reported line number would shift.
export const adapterFor = (formula: string): string =>
    [
        RETURNS_TINT.test(formula)
            ? 'fn point(x: f32, y: f32, t: f32) -> vec4f { return formula(x, y, t); }'
            : 'fn point(x: f32, y: f32, t: f32) -> vec4f { let v = formula(x, y, t); return vec4f(v, v.z); }',
        SCRIPTS_CAMERA.test(formula)
            ? 'fn view(t: f32) -> Camera { return camera(t); }'
            : 'fn view(t: f32) -> Camera { return Camera(vec3f(0.0, 0.0, frame.sizes.z), vec3f(0.0), vec3f(0.0, 1.0, 0.0)); }',
        PLACES_SAMPLES.test(formula)
            ? 'fn sampled(uv: vec2f, index: f32, count: f32) -> vec2f { return lattice(uv, index, count); }'
            : 'fn sampled(uv: vec2f, index: f32, count: f32) -> vec2f { return builtinLattice(uv); }',
        MAPS_SPACE.test(formula)
            ? 'fn placed(p: vec3f) -> vec3f { return space(p); }'
            : 'fn placed(p: vec3f) -> vec3f { return builtinSpace(p); }',
        `fn ownSpace() -> bool { return ${MAPS_SPACE.test(formula) ? 'true' : 'false'}; }`,
        EVOLVES.test(formula)
            ? 'fn evolved(x: f32, y: f32, t: f32) -> vec4f { return evolve(x, y, t); }'
            : 'fn evolved(x: f32, y: f32, t: f32) -> vec4f { return state(); }',
        SEEDS.test(formula)
            ? 'fn seeded(x: f32, y: f32) -> vec4f { return initial(x, y); }'
            : 'fn seeded(x: f32, y: f32) -> vec4f { return vec4f(0.0); }',
    ].join('\n');

export const moduleFor = (formula: string): string =>
    `${PRELUDE}\n${formula}\n${adapterFor(formula)}`;

export type Message = {
    readonly type: string;
    readonly lineNum: number;
    readonly linePos: number;
    readonly message: string;
};

// Only errors: a warning about the prelude is not the formula's business.
export const readableMessages = (messages: readonly Message[], offset: number): string =>
    messages
        .filter(({ type }) => type === 'error')
        .map(({ lineNum, linePos, message }) =>
            lineNum > offset
                ? `ERROR line ${lineNum - offset}:${linePos}: ${message}`
                : `ERROR: ${message}`,
        )
        .join('\n');

export const COLOUR: GPUTextureFormat = 'rgba8unorm';
export const DEPTH: GPUTextureFormat = 'depth24plus';
export const SAMPLES = 4;

export type SketchLayouts = {
    readonly frame: GPUBindGroupLayout;
    readonly knobs: GPUBindGroupLayout;
    readonly writes: GPUBindGroupLayout;
    readonly reads: GPUBindGroupLayout;
    readonly stepping: GPUBindGroupLayout;
    readonly reading: GPUBindGroupLayout;
    readonly compute: GPUPipelineLayout;
    readonly render: GPUPipelineLayout;
};

const EVERY = STAGE.COMPUTE | STAGE.VERTEX | STAGE.FRAGMENT;
export const FRAME_BYTES = 176;
export const SLOT = 256;

export const createSketchLayouts = (device: GPUDevice): SketchLayouts => {
    const frame = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: EVERY,
                buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: FRAME_BYTES },
            },
            { binding: 1, visibility: EVERY, texture: { sampleType: 'float' } },
            {
                binding: 2,
                visibility: EVERY,
                texture: { sampleType: 'float', viewDimension: '2d-array' },
            },
            { binding: 3, visibility: EVERY, sampler: { type: 'filtering' } },
            { binding: 4, visibility: EVERY, sampler: { type: 'filtering' } },
        ],
    });
    const knobs = device.createBindGroupLayout({
        entries: KNOBS.map((_, binding) => ({
            binding,
            visibility: EVERY,
            buffer: { type: 'uniform' as const, hasDynamicOffset: true, minBindingSize: 4 },
        })),
    });
    const writes = device.createBindGroupLayout({
        entries: [{ binding: 0, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } }],
    });
    const reads = device.createBindGroupLayout({
        entries: [
            {
                binding: 1,
                visibility: STAGE.VERTEX,
                buffer: { type: 'read-only-storage' },
            },
        ],
    });
    const stepping = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: STAGE.COMPUTE,
                buffer: { type: 'read-only-storage' },
            },
            { binding: 1, visibility: STAGE.COMPUTE, buffer: { type: 'storage' } },
        ],
    });
    const reading = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: STAGE.VERTEX | STAGE.FRAGMENT,
                buffer: { type: 'read-only-storage' },
            },
        ],
    });

    return {
        frame,
        knobs,
        writes,
        reads,
        stepping,
        reading,
        compute: device.createPipelineLayout({
            bindGroupLayouts: [frame, knobs, writes, stepping],
        }),
        render: device.createPipelineLayout({ bindGroupLayouts: [frame, knobs, reads, reading] }),
    };
};

export type Draws = {
    readonly dots: GPURenderPipeline;
    readonly lines: GPURenderPipeline;
    readonly surface: GPURenderPipeline;
    readonly axes: GPURenderPipeline;
    readonly fade: GPURenderPipeline;
};

export type Sketch = {
    readonly evaluate: GPUComputePipeline;
    readonly advance: GPUComputePipeline | null;
    readonly seed: GPUComputePipeline | null;
    readonly draws: Draws;
    // A formula whose own lattice() or space() goes around x says so with const WRAPS = true.
    readonly wraps: boolean;
    readonly evolves: boolean;
    readonly steps: number;
    readonly knobLabels: Readonly<Record<Knob, string>>;
    readonly knobs: readonly Knob[];
};

export type SketchResult =
    | { readonly ok: true; readonly sketch: Sketch }
    | { readonly ok: false; readonly message: string };

const PREMULTIPLIED: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
};

const drawOf = (
    device: GPUDevice,
    layout: GPUPipelineLayout,
    module: GPUShaderModule,
    vertex: string,
    fragment: string,
    topology: GPUPrimitiveTopology,
    depth: boolean,
): Promise<GPURenderPipeline> =>
    device.createRenderPipelineAsync({
        layout,
        vertex: { module, entryPoint: vertex },
        fragment: {
            module,
            entryPoint: fragment,
            targets: [{ format: COLOUR, blend: PREMULTIPLIED }],
        },
        primitive: { topology },
        depthStencil: {
            format: DEPTH,
            depthWriteEnabled: depth,
            depthCompare: depth ? 'less' : 'always',
        },
        multisample: { count: SAMPLES },
    });

// The automatic layout keeps only the bindings an entry point reads: the compiler, not the text, says which knobs a formula uses.
const knobsRead = async (
    device: GPUDevice,
    module: GPUShaderModule,
    entries: readonly string[],
): Promise<readonly Knob[]> => {
    const buffer = device.createBuffer({ size: 16, usage: BUFFER.UNIFORM });
    const masks = await Promise.all(
        entries.map(async entryPoint => {
            const layout = (
                await device.createComputePipelineAsync({
                    layout: 'auto',
                    compute: { module, entryPoint },
                })
            ).getBindGroupLayout(1);
            const fits = await Promise.all(
                Array.from({ length: 1 << KNOBS.length }, async (_, mask) => {
                    device.pushErrorScope('validation');
                    device.createBindGroup({
                        layout,
                        entries: KNOBS.flatMap((_knob, binding) =>
                            mask & (1 << binding) ? [{ binding, resource: { buffer } }] : [],
                        ),
                    });

                    return (await device.popErrorScope()) === null ? mask : null;
                }),
            );

            return fits.find(mask => mask !== null) ?? 0;
        }),
    );
    buffer.destroy();
    const used = masks.reduce<number>((all, mask) => all | (mask ?? 0), 0);

    return KNOBS.filter((_, binding) => used & (1 << binding));
};

const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

export const createSketch = async (
    device: GPUDevice,
    layouts: SketchLayouts,
    formula: string,
): Promise<SketchResult> => {
    if (writtenInGlsl(formula)) {
        return { ok: false, message: GLSL_MESSAGE };
    }

    const module = device.createShaderModule({ code: moduleFor(formula) });
    const { messages } = await module.getCompilationInfo();
    const errors = readableMessages(messages, PRELUDE_LINES);

    if (errors !== '') {
        return { ok: false, message: errors };
    }

    const stepping = evolves(formula);

    try {
        const [evaluate, advance, seed, dots, lines, surface, axes, fade, knobs] =
            await Promise.all([
                device.createComputePipelineAsync({
                    layout: layouts.compute,
                    compute: { module, entryPoint: 'evaluate' },
                }),
                stepping
                    ? device.createComputePipelineAsync({
                          layout: layouts.compute,
                          compute: { module, entryPoint: 'advance' },
                      })
                    : null,
                stepping
                    ? device.createComputePipelineAsync({
                          layout: layouts.compute,
                          compute: { module, entryPoint: 'seed' },
                      })
                    : null,
                drawOf(
                    device,
                    layouts.render,
                    module,
                    'dotVertex',
                    'dotFragment',
                    'triangle-strip',
                    true,
                ),
                drawOf(
                    device,
                    layouts.render,
                    module,
                    'lineVertex',
                    'plainFragment',
                    'line-list',
                    true,
                ),
                drawOf(
                    device,
                    layouts.render,
                    module,
                    'surfaceVertex',
                    'surfaceFragment',
                    'triangle-list',
                    true,
                ),
                drawOf(
                    device,
                    layouts.render,
                    module,
                    'axisVertex',
                    'axisFragment',
                    'line-list',
                    true,
                ),
                drawOf(
                    device,
                    layouts.render,
                    module,
                    'fadeVertex',
                    'fadeFragment',
                    'triangle-list',
                    false,
                ),
                knobsRead(
                    device,
                    module,
                    stepping ? ['evaluate', 'advance', 'seed'] : ['evaluate'],
                ),
            ]);

        return {
            ok: true,
            sketch: {
                evaluate,
                advance,
                seed,
                draws: { dots, lines, surface, axes, fade },
                wraps: declaresWrap(formula),
                evolves: stepping,
                steps: stepsOf(formula),
                knobLabels: knobLabelsOf(formula),
                knobs,
            },
        };
    } catch (error) {
        return { ok: false, message: messageOf(error) };
    }
};

export const knobsUsed = ({ knobs, knobLabels }: Sketch) =>
    knobs.map(knob => ({ knob, label: knobLabels[knob] }));
