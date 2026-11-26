import { fitted } from '../components/sketch/animation.ts';
import { evolutionTo, stepAt, type Evolved } from '../components/sketch/evolution.ts';
import {
    createSketchResources,
    drawFrame,
    evolve,
    prepare,
    releaseSketchResources,
    type Prepared,
    type Samplers,
    type SketchResources,
} from '../components/sketch/gpu/drawing.ts';
import {
    createSketch,
    createSketchLayouts,
    knobsUsed,
    writtenInGlsl,
    type Sketch,
    type SketchLayouts,
} from '../components/sketch/gpu/sketch-program.ts';
import { panelParams, samePointer, type Pointer } from '../model/sketch/params.ts';
import { buildRamp, RAMP_SIZE, type Theme } from '../model/sketch/theme.ts';
import { themes } from '../model/sketch/themes/registry.ts';
import {
    knobAt,
    sameImage,
    stagesOf,
    type Image,
    type PedalImage,
    type PointsImage,
    type Stage,
    type TracedImage,
} from '../image.ts';
import { PEDALS, type PedalKind } from '../pedals.ts';
import type { Size } from '../layout/frame.ts';
import type { Rgb } from '../lib/color.ts';
import { BUFFER, MAP, STAGE, TEXTURE } from '../lib/gpu.ts';
import {
    createInkPass,
    inked,
    loadStroke,
    releaseInkPass,
    type InkPass,
} from '../shared/gpu/ink.ts';
import { dabCount, type Stroke } from '../shared/stroke.ts';
import type { Shape } from '../model/scene.ts';
import blur from './shaders/blur.wgsl?raw';
import colourmap from './shaders/colourmap.wgsl?raw';
import downsample from './shaders/downsample.wgsl?raw';
import feedback from './shaders/feedback.wgsl?raw';
import fill from './shaders/fill.wgsl?raw';
import kaleido from './shaders/kaleido.wgsl?raw';
import mix from './shaders/mix.wgsl?raw';
import header from './shaders/pass.wgsl?raw';
import present from './shaders/present.wgsl?raw';
import sheet from './shaders/sheet.wgsl?raw';
import tonemap from './shaders/tonemap.wgsl?raw';
import {
    createTracer,
    createTracing,
    releaseTracing,
    traceBatch,
    type Tracer,
    type Tracing,
} from './trace.ts';
import { passesTo, partsOf } from './pacing.ts';
import {
    createFloatTarget,
    createMultisampled,
    createTarget,
    FORMAT,
    releaseTarget,
    type Multisampled,
    type Target,
} from './targets.ts';

export type Moment = {
    readonly t: number;
    readonly seconds: number;
    readonly width: number;
    readonly height: number;
    readonly pointer: Pointer;
    readonly pass: number;
    // The sketch-unit size the picture stands for, a window's own; null frames it at the reference side.
    readonly frame: Size | null;
    // Target pixels per on-screen pixel of the live sketch: below 1 for a tile, so its small dots keep their soft edge.
    readonly dotScale: number;
    // Readers in different lanes keep apart simulations, or a strip's replay would reset the live one every frame.
    readonly lane: string;
    readonly samples: number;
    readonly traceSide: number | null;
};

export type SceneCheck = { readonly ok: true } | { readonly ok: false; readonly message: string };

export type FormulaCheck =
    | { readonly ok: true; readonly knobs: ReturnType<typeof knobsUsed> }
    | { readonly ok: false; readonly message: string };

type Source = {
    readonly resources: SketchResources;
    text: string | null;
    sketch: Sketch | null;
    prepared:
        | (Prepared & {
              readonly image: PointsImage;
              readonly width: number;
              readonly height: number;
              readonly backdrop: readonly [number, number, number];
          })
        | null;
    evolved: Evolved | null;
    side: number;
    pending: Promise<void>;
    used: number;
};

type Cooked = {
    readonly image: Image;
    readonly t: number;
    readonly pass: number;
    readonly pointer: Pointer;
    readonly frame: Size | null;
    readonly dotScale: number;
};

export type Picture = {
    readonly texture: GPUTexture;
    readonly view: GPUTextureView;
    readonly width: number;
    readonly height: number;
};

type Accumulation = {
    front: Target;
    back: Target;
    readonly toned: Target | null;
    parts: number;
};

const traceSizeOf = ({ width, height, traceSide }: Moment) => {
    const scale = traceSide === null ? 1 : Math.min(1, traceSide / Math.max(width, height));

    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
};

type Trace = { code: string | null; tracer: Tracer | null; pending: Promise<void>; used: number };

type Palette = { readonly texture: GPUTexture; readonly view: GPUTextureView; theme: Theme | null };

type Entry = {
    output: Target;
    accumulation: Accumulation | null;
    readonly samples: Multisampled | null;
    spare: Target | null;
    palette: Palette | null;
    cooked: Cooked | null;
    fresh: boolean;
    used: number;
};

type PassKind = PedalKind | 'present' | 'sheet' | 'downsample' | 'fill';

type Passes = {
    readonly layout: GPUBindGroupLayout;
    readonly pipelines: Readonly<Record<PassKind, GPURenderPipeline>>;
    readonly settings: GPUBuffer;
    readonly tonemap: GPURenderPipeline;
    readonly exposure: GPUBuffer;
};

type Sheet = {
    readonly whole: Target;
    readonly now: Target;
    drawn: { readonly stroke: Stroke; readonly ink: Rgb } | null;
    used: number;
};

type Film = { readonly target: Target; used: number };

export type Engine = {
    readonly device: GPUDevice;
    readonly canvas: OffscreenCanvas;
    readonly context: GPUCanvasContext;
    // Announces a program that finished compiling, so a paused window draws once more with it.
    readonly events: EventTarget;
    readonly samplers: Samplers;
    readonly layouts: SketchLayouts;
    readonly passes: Passes;
    readonly tracing: Tracing;
    readonly blank: Target;
    readonly ink: InkPass;
    readonly sheets: Map<string, Sheet>;
    readonly films: Map<'strip' | 'level' | 'level-cell', Film>;
    readonly sources: Map<string, Source>;
    readonly entries: Map<string, Entry>;
    readonly checks: Map<string, Promise<FormulaCheck>>;
    readonly traces: Map<string, Trace>;
    readonly sceneChecks: Map<string, Promise<SceneCheck>>;
};

export const COMPILED = 'compiled';

const REFERENCE_SIDE = 640;
const KNOB_SLOTS = 8;
const FORGET_MS = 3000;
const PASS_BYTES = 80;

export const SHEET_SIDE = 768;

const FRAGMENTS: Readonly<Record<PassKind, string>> = {
    colourmap,
    kaleido,
    feedback,
    mix,
    blur,
    present,
    sheet,
    downsample,
    fill,
};

const createPasses = (device: GPUDevice): Passes => {
    const layout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: STAGE.VERTEX | STAGE.FRAGMENT,
                buffer: { type: 'uniform' },
            },
            ...[1, 2, 3, 4].map(binding => ({
                binding,
                visibility: STAGE.FRAGMENT,
                texture: { sampleType: 'float' as const },
            })),
            { binding: 5, visibility: STAGE.FRAGMENT, sampler: { type: 'filtering' } },
            { binding: 6, visibility: STAGE.FRAGMENT, sampler: { type: 'filtering' } },
        ],
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    const pipelineOf = (fragment: string) => {
        const module = device.createShaderModule({ code: `${header}\n${fragment}` });

        return device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: { module, entryPoint: 'fullscreen' },
            fragment: { module, entryPoint: 'main', targets: [{ format: FORMAT }] },
        });
    };
    const toneModule = device.createShaderModule({ code: tonemap });

    return {
        layout,
        pipelines: {
            colourmap: pipelineOf(FRAGMENTS.colourmap),
            kaleido: pipelineOf(FRAGMENTS.kaleido),
            feedback: pipelineOf(FRAGMENTS.feedback),
            mix: pipelineOf(FRAGMENTS.mix),
            blur: pipelineOf(FRAGMENTS.blur),
            present: pipelineOf(FRAGMENTS.present),
            sheet: pipelineOf(FRAGMENTS.sheet),
            downsample: pipelineOf(FRAGMENTS.downsample),
            fill: pipelineOf(FRAGMENTS.fill),
        },
        settings: device.createBuffer({
            size: PASS_BYTES,
            usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
        }),
        tonemap: device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: toneModule, entryPoint: 'fullscreen' },
            fragment: { module: toneModule, entryPoint: 'main', targets: [{ format: FORMAT }] },
        }),
        exposure: device.createBuffer({ size: 16, usage: BUFFER.UNIFORM | BUFFER.COPY_DST }),
    };
};

export const createEngine = async (): Promise<Engine> => {
    const adapter = await navigator.gpu?.requestAdapter();

    if (adapter === null || adapter === undefined) {
        throw new Error('This browser does not support WebGPU');
    }

    const device = await adapter.requestDevice();
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext('webgpu');

    if (!(context instanceof GPUCanvasContext)) {
        throw new Error('This browser cannot draw WebGPU into a canvas');
    }

    context.configure({ device, format: FORMAT, alphaMode: 'opaque' });

    const blank = createTarget(device, 1, 1);
    device.queue.writeTexture(
        { texture: blank.texture },
        Uint8Array.of(0, 0, 0, 255),
        { bytesPerRow: 4 },
        { width: 1, height: 1 },
    );

    return {
        device,
        canvas,
        context,
        events: new EventTarget(),
        samplers: {
            nearest: device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' }),
            bilinear: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }),
        },
        layouts: createSketchLayouts(device),
        passes: createPasses(device),
        tracing: createTracing(device),
        blank,
        ink: createInkPass(device, FORMAT),
        sheets: new Map(),
        films: new Map(),
        sources: new Map(),
        entries: new Map(),
        checks: new Map(),
        traces: new Map(),
        sceneChecks: new Map(),
    };
};

export const releaseEngine = (engine: Engine): void => {
    releaseInkPass(engine.ink);
    releaseTracing(engine.tracing);
    engine.device.destroy();
};

const CHECKS_KEPT = 16;

const kept = <T>(cache: Map<string, T>, key: string, make: () => T): T => {
    const known = cache.get(key);

    if (known !== undefined) {
        return known;
    }

    const made = make();
    [...cache.keys()]
        .slice(0, Math.max(0, cache.size - CHECKS_KEPT + 1))
        .forEach(old => cache.delete(old));
    cache.set(key, made);

    return made;
};

export const checkFormula = (engine: Engine, text: string): Promise<FormulaCheck> =>
    kept(engine.checks, text, () =>
        createSketch(engine.device, engine.layouts, text).then((result): FormulaCheck =>
            result.ok
                ? { ok: true, knobs: knobsUsed(result.sketch) }
                : { ok: false, message: result.message },
        ),
    );

export const checkScene = (engine: Engine, code: string): Promise<SceneCheck> =>
    kept(engine.sceneChecks, code, () =>
        createTracer(engine.device, engine.tracing, code).then((result): SceneCheck =>
            result.ok ? { ok: true } : { ok: false, message: result.message },
        ),
    );

const keyOf = (store: string, lane: string): string => (lane === '' ? store : `${store}#${lane}`);

// A program that lands later must be drawn: every entry that showed the old one draws again.
const recompiled = (engine: Engine, key: string): void => {
    engine.entries.forEach((entry, entryKey) => {
        if (entryKey.startsWith(`${key}@`)) {
            entry.cooked = null;
        }
    });
    engine.events.dispatchEvent(new Event(COMPILED));
};

const sourceOf = (engine: Engine, key: string): Source => {
    const known = engine.sources.get(key);

    if (known !== undefined) {
        return known;
    }

    const made: Source = {
        resources: createSketchResources(engine.device),
        text: null,
        sketch: null,
        prepared: null,
        evolved: null,
        side: 0,
        pending: Promise.resolve(),
        used: performance.now(),
    };
    engine.sources.set(key, made);

    return made;
};

// A failed edit keeps the last program that compiled, so the picture never blanks while code is typed.
const compiled = (engine: Engine, key: string, source: Source, text: string): Sketch | null => {
    source.used = performance.now();

    if (source.text !== text) {
        source.text = text;
        source.pending = createSketch(engine.device, engine.layouts, text).then(result => {
            if (result.ok && source.text === text) {
                source.sketch = result.sketch;
                source.prepared = null;
                source.evolved = null;
                recompiled(engine, key);
            }
        });
    }

    return source.sketch;
};

const entryKey = (stage: Stage, moment: Moment): string =>
    `${keyOf(stage.store, moment.lane)}@${moment.width}x${moment.height}`;

const entryOf = (engine: Engine, stage: Stage, moment: Moment): Entry => {
    const key = entryKey(stage, moment);
    const known = engine.entries.get(key);

    if (known !== undefined) {
        return known;
    }

    const { device } = engine;
    const samples =
        stage.kind === 'points' ? createMultisampled(device, moment.width, moment.height) : null;
    const made: Entry = {
        output: samples ?? createTarget(device, moment.width, moment.height),
        accumulation: null,
        samples,
        spare:
            stage.kind === 'pedal' &&
            (stage.pedal.kind === 'feedback' || stage.pedal.kind === 'blur')
                ? createTarget(device, moment.width, moment.height)
                : null,
        palette: null,
        cooked: null,
        fresh: true,
        used: 0,
    };
    engine.entries.set(key, made);

    return made;
};

type PassSettings = {
    readonly knobs?: readonly number[];
    readonly resolution?: readonly [number, number];
    readonly direction?: readonly [number, number];
    readonly paper?: readonly [number, number, number, number];
    readonly choice?: number;
    readonly factor?: number;
};

// Must match struct Settings in pass.wgsl, field for field.
const passData = ({
    knobs,
    resolution,
    direction,
    paper,
    choice,
    factor,
}: PassSettings): ArrayBuffer => {
    const bytes = new ArrayBuffer(PASS_BYTES);
    const floats = new Float32Array(bytes);
    const ints = new Int32Array(bytes);

    floats.set(knobs ?? [], 0);
    floats.set(resolution ?? [1, 1], 8);
    floats.set(direction ?? [0, 0], 10);
    floats.set(paper ?? [0, 0, 0, 0], 12);
    ints.set([choice ?? 0, factor ?? 1], 16);

    return bytes;
};

type Inputs = {
    readonly in0?: GPUTextureView;
    readonly in1?: GPUTextureView;
    readonly previous?: GPUTextureView;
    readonly palette?: GPUTextureView;
};

type Area = {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
};

// One pass per submit: its settings are written just before, and the next pass writes over them.
const runPass = (
    engine: Engine,
    kind: PassKind,
    into: GPUTextureView,
    settings: PassSettings,
    inputs: Inputs,
    {
        area = null,
        clear = [0, 0, 0],
    }: {
        readonly area?: Area | null;
        readonly clear?: readonly [number, number, number] | null;
    } = {},
): void => {
    const { device, passes, blank, samplers } = engine;
    device.queue.writeBuffer(passes.settings, 0, passData(settings));

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: into,
                loadOp: clear === null ? 'load' : 'clear',
                clearValue: { r: clear?.[0] ?? 0, g: clear?.[1] ?? 0, b: clear?.[2] ?? 0, a: 1 },
                storeOp: 'store',
            },
        ],
    });
    pass.setPipeline(passes.pipelines[kind]);
    pass.setBindGroup(
        0,
        device.createBindGroup({
            layout: passes.layout,
            entries: [
                { binding: 0, resource: { buffer: passes.settings } },
                { binding: 1, resource: inputs.in0 ?? blank.view },
                { binding: 2, resource: inputs.in1 ?? blank.view },
                { binding: 3, resource: inputs.previous ?? blank.view },
                { binding: 4, resource: inputs.palette ?? blank.view },
                { binding: 5, resource: samplers.bilinear },
                { binding: 6, resource: samplers.nearest },
            ],
        }),
    );

    if (area !== null) {
        pass.setViewport(area.x, area.y, Math.max(area.width, 1), Math.max(area.height, 1), 0, 1);
    }

    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
};

const clearTarget = (
    engine: Engine,
    into: GPUTextureView,
    colour: readonly [number, number, number, number],
): void => {
    const encoder = engine.device.createCommandEncoder();
    encoder
        .beginRenderPass({
            colorAttachments: [
                {
                    view: into,
                    loadOp: 'clear',
                    clearValue: { r: colour[0], g: colour[1], b: colour[2], a: colour[3] },
                    storeOp: 'store',
                },
            ],
        })
        .end();
    engine.device.queue.submit([encoder.finish()]);
};

const samePrepared = (
    prepared: Source['prepared'],
    next: {
        readonly sketch: Sketch;
        readonly image: PointsImage;
        readonly width: number;
        readonly height: number;
        readonly scale: number;
        readonly dotScale: number;
    },
): boolean =>
    prepared !== null &&
    prepared.sketch === next.sketch &&
    prepared.width === next.width &&
    prepared.height === next.height &&
    prepared.pixelRatio === next.scale &&
    prepared.dotScale === next.dotScale &&
    prepared.image.panel === next.image.panel &&
    prepared.image.theme === next.image.theme &&
    prepared.image.sheet === next.image.sheet;

const drawPoints = (engine: Engine, entry: Entry, image: PointsImage, moment: Moment): void => {
    const { width, height, t, seconds, pointer, dotScale } = moment;
    const scale =
        moment.frame === null
            ? Math.max(width, height) / REFERENCE_SIDE
            : width / Math.max(moment.frame.width, 1);
    const key = keyOf(image.store, moment.lane);
    const source = sourceOf(engine, key);
    const sketch = compiled(engine, key, source, image.source);
    const { samples } = entry;

    if (sketch === null || samples === null) {
        clearTarget(engine, entry.output.view, [0, 0, 0, 1]);
        return;
    }

    const params = {
        width: width / scale,
        height: height / scale,
        ...panelParams(image.panel, image.drivers, image.sheet),
        theme: image.theme,
    };

    if (!samePrepared(source.prepared, { sketch, image, width, height, scale, dotScale })) {
        const ramp = buildRamp(image.theme);
        source.prepared = {
            ...prepare(source.resources, sketch, params, ramp, scale, dotScale),
            image,
            width,
            height,
            backdrop: [(ramp[0] ?? 0) / 255, (ramp[1] ?? 0) / 255, (ramp[2] ?? 0) / 255],
        };
        engine.entries.forEach(each => {
            each.fresh = true;
        });
    }

    const prepared = source.prepared;

    if (prepared === null) {
        return;
    }

    const side = 2 * image.panel.dimension;

    if (source.side !== side) {
        source.side = side;
        source.evolved = null;
    }

    const evolution = sketch.evolves
        ? evolutionTo(source.evolved, stepAt(t, seconds, sketch.steps))
        : null;

    if (evolution !== null) {
        evolve(source.resources, engine.layouts, engine.samplers, prepared, evolution, {
            params,
            seconds,
            pointer,
            orbit: image.orbit,
            width,
            height,
        });
        source.evolved = evolution.end;
    }

    drawFrame(
        source.resources,
        engine.layouts,
        engine.samplers,
        prepared,
        params,
        t,
        pointer,
        image.orbit,
        evolution === null ? null : evolution.end.front,
        {
            colour: samples.colourView,
            resolve: samples.view,
            depth: samples.depthView,
            backdrop: prepared.backdrop,
            fresh: entry.fresh,
        },
        { width, height },
    );
    entry.fresh = false;
};

// A failed edit keeps the last program that compiled, so the picture never blanks while code is typed.
const traceOf = (
    engine: Engine,
    key: string,
    code: string,
    shapes: readonly Shape[],
): Tracer | null => {
    const trace = engine.traces.get(key) ?? {
        code: null,
        tracer: null,
        pending: Promise.resolve(),
        used: 0,
    };
    const source = `${shapes.join(',')}\n${code}`;
    engine.traces.set(key, trace);
    trace.used = performance.now();

    if (trace.code !== source) {
        trace.code = source;
        trace.pending = createTracer(engine.device, engine.tracing, code, shapes).then(result => {
            if (result.ok && trace.code === source) {
                trace.tracer = result.tracer;
                recompiled(engine, key);
            }
        });
    }

    return trace.tracer;
};

const tracerOf = (engine: Engine, image: TracedImage, lane: string): Tracer | null =>
    traceOf(
        engine,
        keyOf(image.store, lane),
        // Code saved in GLSL is set aside, not the scene: its objects still draw while the Code tab says why.
        writtenInGlsl(image.scene.code) ? '' : image.scene.code,
        image.scene.objects.map(({ shape }) => shape),
    );

// An engine that has compiled nothing yet would draw its first frames blank: an export or a reading waits for its programs first.
export const readyFor = (engine: Engine, image: Image, lane: string): Promise<void> =>
    Promise.all(
        stagesOf(image).map(stage => {
            const key = keyOf(stage.store, lane);

            if (stage.kind === 'points') {
                const source = sourceOf(engine, key);
                compiled(engine, key, source, stage.source);

                return source.pending;
            }

            if (stage.kind === 'traced') {
                tracerOf(engine, stage, lane);

                return engine.traces.get(key)?.pending ?? Promise.resolve();
            }

            return Promise.resolve();
        }),
    ).then(() => undefined);

const MAX_BATCH = 16;

// Samples in one dispatch stay under this many pixel-samples, or an export at full size could stall the GPU long enough to lose it.
const SAMPLE_BUDGET = 1 << 17;

const releaseAccumulation = (accumulation: Accumulation): void => {
    releaseTarget(accumulation.front);
    releaseTarget(accumulation.back);
    if (accumulation.toned !== null) {
        releaseTarget(accumulation.toned);
    }
};

const paletteOf = (engine: Engine, entry: Entry, theme: Theme): GPUTextureView => {
    const palette =
        entry.palette ??
        (() => {
            const texture = engine.device.createTexture({
                size: { width: RAMP_SIZE, height: 1 },
                format: 'rgba8unorm',
                usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST,
            });

            return { texture, view: texture.createView(), theme: null };
        })();
    entry.palette = palette;

    if (palette.theme !== theme) {
        engine.device.queue.writeTexture(
            { texture: palette.texture },
            buildRamp(theme),
            { bytesPerRow: RAMP_SIZE * 4 },
            { width: RAMP_SIZE, height: 1 },
        );
        palette.theme = theme;
    }

    return palette.view;
};

const drawTraced = (
    engine: Engine,
    entry: Entry,
    image: TracedImage,
    moment: Moment,
    restart: boolean,
): void => {
    const { device } = engine;
    const tracer = tracerOf(engine, image, moment.lane);

    if (tracer === null) {
        clearTarget(engine, entry.output.view, [0, 0, 0, 1]);
        return;
    }

    const size = traceSizeOf(moment);
    const known =
        entry.accumulation?.front.width === size.width &&
        entry.accumulation.front.height === size.height
            ? entry.accumulation
            : null;

    if (known === null && entry.accumulation !== null) {
        releaseAccumulation(entry.accumulation);
    }

    const accumulation = known ?? {
        front: createFloatTarget(device, size.width, size.height),
        back: createFloatTarget(device, size.width, size.height),
        toned:
            size.width === moment.width && size.height === moment.height
                ? null
                : createTarget(device, size.width, size.height),
        parts: 0,
    };
    entry.accumulation = accumulation;

    // Each pixel keeps its own count in alpha, so a restart must zero it, not just the colour.
    if (restart || known === null) {
        clearTarget(engine, accumulation.front.view, [0, 0, 0, 0]);
        accumulation.parts = 0;
    }

    const palette = paletteOf(engine, entry, image.theme);
    const pixels = size.width * size.height;
    const each = Math.min(MAX_BATCH, Math.max(1, Math.floor(SAMPLE_BUDGET / pixels)));
    const wanted = partsOf(moment.samples);

    passesTo(accumulation.parts, wanted, each).forEach(pass => {
        traceBatch(
            device,
            engine.tracing,
            tracer,
            image,
            accumulation.back,
            accumulation.front,
            { view: palette, sampler: engine.samplers.nearest },
            moment.t,
            pass,
        );
        const front = accumulation.back;
        accumulation.back = accumulation.front;
        accumulation.front = front;
    });
    accumulation.parts = Math.max(accumulation.parts, wanted);

    const toned = accumulation.toned ?? entry.output;
    device.queue.writeBuffer(
        engine.passes.exposure,
        0,
        Float32Array.of(image.scene.exposure, 0, 0, 0),
    );
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: toned.view, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(engine.passes.tonemap);
    pass.setBindGroup(
        0,
        device.createBindGroup({
            layout: engine.passes.tonemap.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: engine.passes.exposure } },
                { binding: 1, resource: accumulation.front.view },
            ],
        }),
    );
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);

    if (accumulation.toned !== null) {
        runPass(engine, 'present', entry.output.view, {}, { in0: accumulation.toned.view });
    }
};

const drawPedal = (
    engine: Engine,
    entry: Entry,
    image: PedalImage,
    inputs: readonly (GPUTextureView | null)[],
    { t, width, height }: Moment,
): void => {
    const { kind } = image.pedal;
    const spec = PEDALS[kind];
    const knobs = Array.from({ length: KNOB_SLOTS }, (_, index) => {
        const knob = spec.knobs[index];

        return knob === undefined ? 0 : knobAt(image, knob.name, t);
    });
    const settings: PassSettings = {
        knobs,
        resolution: [width, height],
        choice: Math.max(
            0,
            spec.choices.findIndex(choice => choice === image.pedal.choice),
        ),
    };
    const given: Inputs = {
        in0: inputs[0] ?? engine.blank.view,
        in1: inputs[1] ?? engine.blank.view,
    };

    switch (kind) {
        case 'colourmap':
            runPass(engine, kind, entry.output.view, settings, {
                ...given,
                palette: paletteOf(engine, entry, image.theme ?? themes.paper),
            });
            break;
        case 'feedback': {
            const spare = entry.spare ?? entry.output;
            runPass(
                engine,
                kind,
                spare.view,
                // A new stage has no past: its first frame is the picture itself, not a fade from black.
                entry.cooked === null ? { ...settings, knobs: [0, ...knobs.slice(1)] } : settings,
                { ...given, previous: entry.output.view },
            );
            entry.spare = entry.output;
            entry.output = spare;
            break;
        }
        case 'blur': {
            const spare = entry.spare ?? entry.output;
            runPass(engine, kind, spare.view, { ...settings, direction: [1, 0] }, given);
            runPass(
                engine,
                kind,
                entry.output.view,
                { ...settings, direction: [0, 1] },
                { in0: spare.view },
            );
            break;
        }
        case 'kaleido':
        case 'mix':
            runPass(engine, kind, entry.output.view, settings, given);
            break;
    }
};

const forget = (engine: Engine, now: number): void => {
    engine.entries.forEach((entry, key) => {
        if (now - entry.used > FORGET_MS) {
            releaseTarget(entry.samples ?? entry.output);
            if (entry.spare !== null) {
                releaseTarget(entry.spare);
            }
            entry.palette?.texture.destroy();
            if (entry.accumulation !== null) {
                releaseAccumulation(entry.accumulation);
            }
            engine.entries.delete(key);
        }
    });
    engine.sheets.forEach((sheet, key) => {
        if (now - sheet.used > FORGET_MS) {
            releaseTarget(sheet.whole);
            releaseTarget(sheet.now);
            engine.sheets.delete(key);
        }
    });
    engine.films.forEach((film, key) => {
        if (now - film.used > FORGET_MS) {
            releaseTarget(film.target);
            engine.films.delete(key);
        }
    });
    engine.traces.forEach((trace, key) => {
        if (
            now - trace.used > FORGET_MS &&
            ![...engine.entries.keys()].some(each => each.startsWith(`${key}@`))
        ) {
            engine.traces.delete(key);
        }
    });
    engine.sources.forEach((source, key) => {
        if (
            now - source.used > FORGET_MS &&
            ![...engine.entries.keys()].some(each => each.startsWith(`${key}@`))
        ) {
            releaseSketchResources(source.resources);
            engine.sources.delete(key);
        }
    });
};

const sameFrame = (a: Size | null, b: Size | null): boolean =>
    a === null || b === null ? a === b : a.width === b.width && a.height === b.height;

export type Why =
    'new' | 'recipe' | 'moment' | 'pass' | 'pointer' | 'frame' | 'dots' | 'samples' | 'input';

export const whyCooked = (
    cooked: Cooked | null,
    stage: Stage,
    moment: Moment,
    parts: number,
): Why | null =>
    cooked === null
        ? 'new'
        : !sameImage(cooked.image, stage)
          ? 'recipe'
          : cooked.t !== moment.t
            ? 'moment'
            : cooked.pass !== moment.pass
              ? 'pass'
              : !samePointer(cooked.pointer, moment.pointer)
                ? 'pointer'
                : !sameFrame(cooked.frame, moment.frame)
                  ? 'frame'
                  : cooked.dotScale !== moment.dotScale
                    ? 'dots'
                    : stage.kind === 'traced' && parts < partsOf(moment.samples)
                      ? 'samples'
                      : null;

export const COOKED = 'hakase:cooked';

export type Drawn = {
    readonly entry: string;
    readonly lane: string;
    readonly kind: Stage['kind'];
    readonly why: Why;
    readonly frame: number | null;
};

export const cook = (engine: Engine, image: Image, moment: Moment, now: number): Picture | null => {
    const frameTime = document.timeline.currentTime;
    const { pictures: drawn, draws } = stagesOf(image).reduce(
        ({ pictures, draws: before }, stage) => {
            const entry = entryOf(engine, stage, moment);
            // A picture is its inputs' too: one that refined or recompiled leaves the same recipe and the same moment.
            const why =
                whyCooked(entry.cooked, stage, moment, entry.accumulation?.parts ?? 0) ??
                (stage.kind === 'pedal' &&
                stage.inputs.some(
                    input =>
                        input.kind !== 'none' &&
                        before.some(
                            ({ entry: drawnEntry }) => drawnEntry === entryKey(input, moment),
                        ),
                )
                    ? 'input'
                    : null);
            const same = why === null || why === 'samples';

            if (why !== null) {
                if (stage.kind === 'traced') {
                    drawTraced(engine, entry, stage, moment, !same);
                } else if (stage.kind === 'points') {
                    drawPoints(engine, entry, stage, moment);
                } else {
                    drawPedal(
                        engine,
                        entry,
                        stage,
                        stage.inputs.map(input =>
                            input.kind === 'none'
                                ? null
                                : (pictures.get(input.store)?.view ?? null),
                        ),
                        moment,
                    );
                }
                entry.cooked = {
                    image: stage,
                    t: moment.t,
                    pass: moment.pass,
                    pointer: moment.pointer,
                    frame: moment.frame,
                    dotScale: moment.dotScale,
                };
            }

            entry.used = now;

            return {
                pictures: new Map(pictures).set(stage.store, {
                    texture: entry.output.texture,
                    view: entry.output.view,
                    width: moment.width,
                    height: moment.height,
                }),
                draws:
                    why === null
                        ? before
                        : [
                              ...before,
                              {
                                  entry: entryKey(stage, moment),
                                  lane: moment.lane,
                                  kind: stage.kind,
                                  why,
                                  frame: typeof frameTime === 'number' ? frameTime : null,
                              },
                          ],
            };
        },
        { pictures: new Map<string, Picture>(), draws: new Array<Drawn>() },
    );

    forget(engine, now);
    // Announced, not returned: the inspector counts every engine's draws without holding one open.
    if (draws.length > 0) {
        dispatchEvent(new CustomEvent(COOKED, { detail: draws }));
    }

    return image.kind === 'none' ? null : (drawn.get(image.store) ?? null);
};

const GROWTH = 512;

const grownSide = (current: number, needed: number, limit: number): number =>
    needed <= current
        ? current
        : Math.min(limit, Math.ceil(Math.max(needed, current * 1.5) / GROWTH) * GROWTH);

export const textureLimit = (engine: Engine): number => engine.device.limits.maxTextureDimension2D;

// A strip draws into a target of its own: a window's bitmap is the whole canvas, so the canvas is only ever as large as one picture.
// Growing clears it, so a strip reserves its whole width before its first tile; by half at least, or every pinch reallocates.
export const filmFor = (engine: Engine, width: number, height: number, now: number): Target => {
    const limit = textureLimit(engine);
    const known = engine.films.get('strip');
    const next = {
        width: grownSide(known?.target.width ?? 0, width, limit),
        height: grownSide(known?.target.height ?? 0, height, limit),
    };
    const film =
        known !== undefined &&
        known.target.width === next.width &&
        known.target.height === next.height
            ? known
            : { target: createTarget(engine.device, next.width, next.height), used: now };

    if (known !== undefined && film !== known) {
        releaseTarget(known.target);
    }

    film.used = now;
    engine.films.set('strip', film);

    return film.target;
};

const filmOf = (engine: Engine, key: 'level' | 'level-cell', side: number, now: number): Target => {
    const known = engine.films.get(key);
    const film =
        known !== undefined && known.target.width === side
            ? known
            : { target: createTarget(engine.device, side, side), used: now };

    if (known !== undefined && film !== known) {
        releaseTarget(known.target);
    }

    film.used = now;
    engine.films.set(key, film);

    return film.target;
};

// Averaged into a cell of a target of its own, never read from a stage: a read waits for every queued draw, so a curve reads once.
export const averagedInto = (
    engine: Engine,
    picture: Picture | null,
    at: { readonly x: number; readonly y: number },
    cell: number,
    atlas: number,
    now: number,
): void => {
    const scratch = filmOf(engine, 'level-cell', cell, now);
    const into = filmOf(engine, 'level', atlas, now);

    runPass(
        engine,
        'downsample',
        scratch.view,
        { factor: Math.max(1, Math.round((picture?.width ?? cell) / cell)) },
        { in0: picture?.view ?? engine.blank.view },
    );
    const encoder = engine.device.createCommandEncoder();
    encoder.copyTextureToTexture(
        { texture: scratch.texture },
        { texture: into.texture, origin: { x: at.x, y: at.y } },
        { width: cell, height: cell },
    );
    engine.device.queue.submit([encoder.finish()]);
};

export const readAtlas = async (
    engine: Engine,
    atlas: number,
    now: number,
): Promise<Uint8Array> => {
    const { device } = engine;
    const bytesPerRow = Math.ceil((atlas * 4) / 256) * 256;
    const buffer = device.createBuffer({
        size: bytesPerRow * atlas,
        usage: BUFFER.MAP_READ | BUFFER.COPY_DST,
    });
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer(
        { texture: filmOf(engine, 'level', atlas, now).texture },
        { buffer, bytesPerRow, rowsPerImage: atlas },
        { width: atlas, height: atlas },
    );
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(MAP.READ);
    const rows = new Uint8Array(buffer.getMappedRange());
    const pixels = Uint8Array.from({ length: atlas * atlas * 4 }, (_, index) => {
        const row = Math.floor(index / (atlas * 4));

        return rows[row * bytesPerRow + (index % (atlas * 4))] ?? 0;
    });
    buffer.unmap();
    buffer.destroy();

    return pixels;
};

// The canvas is sized to each picture: a window's bitmap takes the whole canvas, and handing it over costs nothing.
const canvasView = (engine: Engine, width: number, height: number): GPUTextureView => {
    const { canvas } = engine;

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    return engine.context.getCurrentTexture().createView();
};

export const backdropOf = (image: Image): readonly [number, number, number] => {
    if (image.kind !== 'points' && image.kind !== 'traced') {
        return [0, 0, 0];
    }

    const ramp = buildRamp(image.theme);

    return [(ramp[0] ?? 0) / 255, (ramp[1] ?? 0) / 255, (ramp[2] ?? 0) / 255];
};

export const framedIn = (
    engine: Engine,
    into: GPUTextureView,
    picture: Picture | null,
    slot: { readonly x: number; readonly width: number; readonly height: number },
    backdrop: readonly [number, number, number],
    clearing: boolean,
): void => {
    const box =
        picture === null
            ? { x: 0, y: 0, width: slot.width, height: slot.height }
            : fitted(slot, picture);

    runPass(
        engine,
        'fill',
        into,
        { paper: [...backdrop, 0] },
        {},
        {
            area: { x: slot.x, y: 0, width: slot.width, height: slot.height },
            clear: clearing ? backdrop : null,
        },
    );
    runPass(
        engine,
        'present',
        into,
        {},
        { in0: picture?.view ?? engine.blank.view },
        {
            area: { x: slot.x + box.x, y: box.y, width: box.width, height: box.height },
            clear: null,
        },
    );
};

export const filmed = (
    engine: Engine,
    film: Target,
    width: number,
    height: number,
    factor: number,
): Promise<ImageBitmap> => {
    runPass(
        engine,
        'downsample',
        canvasView(engine, width, height),
        { factor },
        { in0: film.view },
    );

    return Promise.resolve(engine.canvas.transferToImageBitmap());
};

export const presented = (
    engine: Engine,
    picture: Picture | null,
    width: number,
    height: number,
    backdrop: readonly [number, number, number],
): Promise<ImageBitmap> => {
    framedIn(
        engine,
        canvasView(engine, width, height),
        picture,
        { x: 0, width, height },
        backdrop,
        true,
    );

    return Promise.resolve(engine.canvas.transferToImageBitmap());
};

const sameRgb = (a: Rgb, b: Rgb): boolean => a.r === b.r && a.g === b.g && a.b === b.b;

export const sheetOf = (
    engine: Engine,
    key: string,
    stroke: Stroke,
    count: number,
    { ink, paper, faint }: { readonly ink: Rgb; readonly paper: Rgb; readonly faint: number },
    now: number,
): Promise<ImageBitmap> => {
    const { device } = engine;
    const sheet = engine.sheets.get(key) ?? {
        whole: createTarget(device, SHEET_SIDE, SHEET_SIDE),
        now: createTarget(device, SHEET_SIDE, SHEET_SIDE),
        drawn: null,
        used: now,
    };
    engine.sheets.set(key, sheet);
    sheet.used = now;

    loadStroke(engine.ink, stroke);
    const colour = [ink.r, ink.g, ink.b] as const;

    if (sheet.drawn?.stroke !== stroke || !sameRgb(sheet.drawn.ink, ink)) {
        const encoder = device.createCommandEncoder();
        inked(engine.ink, encoder, sheet.whole.view, stroke, dabCount(stroke), {
            side: SHEET_SIDE,
            colour,
        });
        device.queue.submit([encoder.finish()]);
        sheet.drawn = { stroke, ink };
    }

    const encoder = device.createCommandEncoder();
    inked(engine.ink, encoder, sheet.now.view, stroke, count, { side: SHEET_SIDE, colour });
    device.queue.submit([encoder.finish()]);

    runPass(
        engine,
        'sheet',
        canvasView(engine, SHEET_SIDE, SHEET_SIDE),
        { paper: [paper.r, paper.g, paper.b, faint] },
        { in0: sheet.whole.view, in1: sheet.now.view },
    );
    forget(engine, now);

    return Promise.resolve(engine.canvas.transferToImageBitmap());
};
