import { BUFFER, TEXTURE } from '../../../lib/gpu.ts';
import {
    DRAW_MODES,
    KNOBS,
    colourShiftAt,
    dotsAt,
    focusAt,
    knobValue,
    orbitAt,
    trailsAt,
    type DrawMode,
    type PanelParams,
    type Pointer,
    type SketchParams,
} from '../../../model/sketch/params.ts';
import {
    LATTICES,
    LENSES,
    SPACES,
    orbitUniform,
    projection,
    REFERENCE_DISTANCE,
    wraps,
    type Orbit,
} from '../../../model/sketch/space.ts';
import { RAMP_SIZE } from '../../../model/sketch/theme.ts';
import { frameAt } from '../../../shared/picture.ts';
import {
    createInkPass,
    inked,
    loadStroke,
    releaseInkPass,
    type InkPass,
} from '../../../shared/gpu/ink.ts';
import { dabsAt, INK_SIDE, isStroke, type Sheet } from '../../../shared/stroke.ts';
import { momentOf, type Evolution, type Front } from '../evolution.ts';
import { FRAME_BYTES, SLOT, type Sketch, type SketchLayouts } from './sketch-program.ts';

export type Samplers = { readonly nearest: GPUSampler; readonly bilinear: GPUSampler };

type Paint = {
    readonly texture: GPUTexture;
    readonly view: GPUTextureView;
    readonly sheet: Sheet | null;
};

export type SketchResources = {
    readonly device: GPUDevice;
    readonly palette: GPUTexture;
    readonly ink: InkPass;
    readonly spare: readonly [GPUBuffer, GPUBuffer];
    paint: Paint;
    ring: GPUBuffer;
    points: GPUBuffer | null;
    state: readonly [GPUBuffer, GPUBuffer] | null;
};

// Every knob and every frame takes its own slot: a dynamic offset must be a multiple of 256.
const SLOTS_PER_MOMENT = 1 + KNOBS.length;
const STEPS_PER_SUBMIT = 256;

const storage = (device: GPUDevice, size: number): GPUBuffer =>
    device.createBuffer({ size: Math.max(size, 16), usage: BUFFER.STORAGE });

const paintOf = (device: GPUDevice, sheet: Sheet | null): Paint => {
    const stroke = sheet !== null && isStroke(sheet);
    const side = stroke ? INK_SIDE : (sheet?.side ?? 1);
    const layers = sheet === null || stroke ? 1 : sheet.frames.length;
    const texture = device.createTexture({
        size: { width: side, height: side, depthOrArrayLayers: layers },
        format: stroke ? 'rgba8unorm' : 'r8unorm',
        usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
    });

    if (sheet !== null && !isStroke(sheet)) {
        device.queue.writeTexture(
            { texture },
            Uint8Array.from(sheet.frames.flat()),
            { bytesPerRow: side, rowsPerImage: side },
            { width: side, height: side, depthOrArrayLayers: layers },
        );
    }

    return { texture, view: texture.createView({ dimension: '2d-array' }), sheet };
};

export const createSketchResources = (device: GPUDevice): SketchResources => ({
    device,
    palette: device.createTexture({
        size: { width: RAMP_SIZE, height: 1 },
        format: 'rgba8unorm',
        usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST,
    }),
    ink: createInkPass(device, 'rgba8unorm'),
    spare: [storage(device, 16), storage(device, 16)],
    paint: paintOf(device, null),
    ring: device.createBuffer({
        size: SLOT * SLOTS_PER_MOMENT,
        usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
    }),
    points: null,
    state: null,
});

export const releaseSketchResources = (resources: SketchResources): void => {
    resources.palette.destroy();
    resources.paint.texture.destroy();
    resources.ring.destroy();
    resources.points?.destroy();
    resources.state?.forEach(buffer => {
        buffer.destroy();
    });
    resources.spare.forEach(buffer => {
        buffer.destroy();
    });
    releaseInkPass(resources.ink);
};

export type Prepared = {
    readonly sketch: Sketch;
    readonly projection: Float32Array;
    readonly mode: DrawMode;
    readonly dimension: number;
    readonly pixelRatio: number;
    readonly dotScale: number;
    readonly lens: number;
    readonly lattice: number;
    readonly space: number;
    readonly wrap: boolean;
    readonly fades: boolean;
    readonly frames: number;
};

const closesSeam = (
    { wraps: declared }: Sketch,
    { lattice, space }: Pick<PanelParams, 'lattice' | 'space'>,
): boolean => declared || wraps(lattice, space);

export const prepare = (
    resources: SketchResources,
    sketch: Sketch,
    params: SketchParams,
    ramp: Uint8Array,
    pixelRatio: number,
    dotScale = 1,
): Prepared => {
    const { device } = resources;
    const { picture } = params;

    device.queue.writeTexture(
        { texture: resources.palette },
        ramp,
        { bytesPerRow: RAMP_SIZE * 4 },
        { width: RAMP_SIZE, height: 1 },
    );

    if (resources.paint.sheet !== picture) {
        resources.paint.texture.destroy();
        resources.paint = paintOf(device, picture);
    }

    if (picture !== null && isStroke(picture)) {
        loadStroke(resources.ink, picture);
    }

    return {
        sketch,
        projection: projection(params.width / Math.max(params.height, 1), params.fit, params.lens),
        mode: params.draw.mode,
        dimension: params.dimension,
        pixelRatio,
        dotScale,
        lens: LENSES.indexOf(params.lens),
        lattice: LATTICES.indexOf(params.lattice),
        space: SPACES.indexOf(params.space),
        wrap: closesSeam(sketch, params),
        fades: picture !== null && !isStroke(picture) && picture.fade,
        frames: picture === null || isStroke(picture) ? 1 : picture.frames.length,
    };
};

type Moment = {
    readonly params: Pick<
        PanelParams,
        'knobs' | 'motion' | 'signals' | 'focus' | 'draw' | 'picture' | 'trails'
    >;
    readonly t: number;
    readonly pointer: Pointer;
    readonly orbit: Orbit;
    readonly width: number;
    readonly height: number;
};

// Must match struct Frame in sketch.wgsl, field for field.
const frameData = (prepared: Prepared, { params, t, pointer, orbit, width, height }: Moment) => {
    const bytes = new ArrayBuffer(SLOT);
    const floats = new Float32Array(bytes);
    const ints = new Int32Array(bytes);
    const dots = dotsAt(params, t);
    const { picture } = params;

    floats.set(prepared.projection, 0);
    floats.set([...orbitUniform(orbitAt(params, orbit, t)), 0], 16);
    floats.set([pointer.x, pointer.y, pointer.down ? 1 : 0, t], 20);
    floats.set([width, height, prepared.dotScale, prepared.pixelRatio], 24);
    floats.set(
        [dots?.baseSize ?? 1, dots?.depthScalar ?? 0, REFERENCE_DISTANCE, focusAt(params, t)],
        28,
    );
    floats.set(
        [
            colourShiftAt(params, t),
            1 - trailsAt(params, t),
            picture === null || isStroke(picture) ? 0 : frameAt(picture, t),
            prepared.frames,
        ],
        32,
    );
    ints.set(
        [DRAW_MODES.indexOf(prepared.mode), prepared.lens, prepared.lattice, prepared.space],
        36,
    );
    ints.set([prepared.dimension, prepared.wrap ? 1 : 0, prepared.fades ? 1 : 0, 0], 40);

    return {
        bytes: new Uint8Array(bytes, 0, FRAME_BYTES),
        knobs: KNOBS.map(knob => knobValue(params, knob, t)),
    };
};

const ensureRing = (resources: SketchResources, moments: number): void => {
    const size = SLOT * SLOTS_PER_MOMENT * moments;

    if (resources.ring.size < size) {
        resources.ring.destroy();
        resources.ring = resources.device.createBuffer({
            size,
            usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
        });
    }
};

const writeMoments = (
    resources: SketchResources,
    prepared: Prepared,
    moments: readonly Moment[],
): void => {
    ensureRing(resources, moments.length);
    const data = new Uint8Array(SLOT * SLOTS_PER_MOMENT * moments.length);

    moments.forEach((moment, index) => {
        const { bytes, knobs } = frameData(prepared, moment);
        const base = index * SLOT * SLOTS_PER_MOMENT;
        data.set(bytes, base);
        knobs.forEach((value, knob) => {
            data.set(new Uint8Array(Float32Array.of(value).buffer), base + SLOT * (1 + knob));
        });
    });

    resources.device.queue.writeBuffer(resources.ring, 0, data);
};

const offsetsOf = (index: number) => {
    const base = index * SLOT * SLOTS_PER_MOMENT;

    return {
        frame: [base],
        knobs: KNOBS.map((_, knob) => base + SLOT * (1 + knob)),
    };
};

const sharedGroups = (resources: SketchResources, layouts: SketchLayouts, samplers: Samplers) => {
    const { device, ring } = resources;

    return {
        frame: device.createBindGroup({
            layout: layouts.frame,
            entries: [
                { binding: 0, resource: { buffer: ring, size: FRAME_BYTES } },
                { binding: 1, resource: resources.palette.createView() },
                { binding: 2, resource: resources.paint.view },
                { binding: 3, resource: samplers.nearest },
                { binding: 4, resource: samplers.bilinear },
            ],
        }),
        knobs: device.createBindGroup({
            layout: layouts.knobs,
            entries: KNOBS.map((_, binding) => ({
                binding,
                resource: { buffer: ring, size: 4 },
            })),
        }),
    };
};

const sideOf = (prepared: Prepared) => 2 * prepared.dimension;

const ensureState = (resources: SketchResources, side: number): readonly [GPUBuffer, GPUBuffer] => {
    const size = side * side * 16;

    if (resources.state === null || resources.state[0].size !== size) {
        resources.state?.forEach(buffer => {
            buffer.destroy();
        });
        resources.state = [storage(resources.device, size), storage(resources.device, size)];
    }

    return resources.state;
};

const ensurePoints = (resources: SketchResources, side: number): GPUBuffer => {
    const size = side * side * 16;

    if (resources.points === null || resources.points.size !== size) {
        resources.points?.destroy();
        resources.points = storage(resources.device, size);
    }

    return resources.points;
};

const other = (front: Front): Front => (front === 0 ? 1 : 0);

const workgroups = (side: number) => Math.ceil((side * side) / 64);

export const evolve = (
    resources: SketchResources,
    layouts: SketchLayouts,
    samplers: Samplers,
    prepared: Prepared,
    evolution: Evolution,
    moment: Omit<Moment, 't'> & { readonly seconds: number },
): void => {
    const { sketch } = prepared;

    if (
        (!evolution.reset && evolution.to === evolution.from) ||
        sketch.advance === null ||
        sketch.seed === null
    ) {
        return;
    }

    const { device } = resources;
    const side = sideOf(prepared);
    const state = ensureState(resources, side);
    const writes = device.createBindGroup({
        layout: layouts.writes,
        entries: [{ binding: 0, resource: { buffer: resources.spare[0] } }],
    });
    const stepping = ([0, 1] as const).map(from =>
        device.createBindGroup({
            layout: layouts.stepping,
            entries: [
                { binding: 0, resource: { buffer: state[from] } },
                { binding: 1, resource: { buffer: state[other(from)] } },
            ],
        }),
    );
    const passes = [
        ...(evolution.reset ? [{ seed: true, t: 0 }] : []),
        ...Array.from({ length: evolution.to - evolution.from }, (_, index) => ({
            seed: false,
            t: momentOf(evolution.from + 1 + index, moment.seconds, sketch.steps),
        })),
    ];
    const chunks = Array.from({ length: Math.ceil(passes.length / STEPS_PER_SUBMIT) }, (_, index) =>
        passes.slice(index * STEPS_PER_SUBMIT, (index + 1) * STEPS_PER_SUBMIT),
    );

    chunks.reduce<{ front: Front; done: number }>(
        ({ front, done }, chunk) => {
            writeMoments(
                resources,
                prepared,
                chunk.map(({ t }) => ({ ...moment, t })),
            );
            const groups = sharedGroups(resources, layouts, samplers);
            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            const end = chunk.reduce<Front>((from, step, index) => {
                const offsets = offsetsOf(index);
                pass.setPipeline(
                    step.seed
                        ? (sketch.seed ?? sketch.evaluate)
                        : (sketch.advance ?? sketch.evaluate),
                );
                pass.setBindGroup(0, groups.frame, offsets.frame);
                pass.setBindGroup(1, groups.knobs, offsets.knobs);
                pass.setBindGroup(2, writes);
                pass.setBindGroup(3, stepping[from] ?? null);
                pass.dispatchWorkgroups(workgroups(side));

                return other(from);
            }, front);
            pass.end();
            device.queue.submit([encoder.finish()]);

            return { front: end, done: done + chunk.length };
        },
        { front: evolution.start, done: 0 },
    );
};

const vertexCount = (mode: DrawMode, side: number, wrap: boolean): number => {
    switch (mode) {
        case 'dots':
            return 4;
        case 'lines':
            return side * side * 4;
        case 'surface':
            return (wrap ? side : side - 1) * (side - 1) * 6;
    }
};

// Must match the axes in sketch.wgsl: 7 lines of 48 pieces of two vertices, then 12 ticks of two.
const AXIS_VERTICES = 7 * 48 * 2 + 12 * 2;

export type Frame = {
    readonly colour: GPUTextureView;
    readonly resolve: GPUTextureView;
    readonly depth: GPUTextureView;
    readonly backdrop: readonly [number, number, number];
    // True after a prepare: a change of settings starts the trails afresh rather than smearing the old picture into it.
    readonly fresh: boolean;
};

export const drawFrame = (
    resources: SketchResources,
    layouts: SketchLayouts,
    samplers: Samplers,
    prepared: Prepared,
    params: PanelParams,
    playhead: number,
    pointer: Pointer,
    orbit: Orbit,
    front: Front | null,
    { colour, resolve, depth, backdrop, fresh }: Frame,
    size: { readonly width: number; readonly height: number },
): void => {
    const { device } = resources;
    const { sketch, mode } = prepared;
    const side = sideOf(prepared);
    const points = ensurePoints(resources, side);
    const { picture } = params;
    const trails = trailsAt(params, playhead);

    writeMoments(resources, prepared, [{ params, t: playhead, pointer, orbit, ...size }]);
    const groups = sharedGroups(resources, layouts, samplers);
    const offsets = offsetsOf(0);
    const state = front === null ? resources.spare : (resources.state ?? resources.spare);
    const reading = state[front ?? 0];
    const encoder = device.createCommandEncoder();

    if (picture !== null && isStroke(picture)) {
        inked(
            resources.ink,
            encoder,
            resources.paint.texture.createView({
                dimension: '2d',
                baseArrayLayer: 0,
                arrayLayerCount: 1,
            }),
            picture,
            dabsAt(picture, playhead),
            { side: INK_SIDE, colour: [1, 1, 1] },
        );
    }

    const compute = encoder.beginComputePass();
    compute.setPipeline(sketch.evaluate);
    compute.setBindGroup(0, groups.frame, offsets.frame);
    compute.setBindGroup(1, groups.knobs, offsets.knobs);
    compute.setBindGroup(
        2,
        device.createBindGroup({
            layout: layouts.writes,
            entries: [{ binding: 0, resource: { buffer: points } }],
        }),
    );
    compute.setBindGroup(
        3,
        device.createBindGroup({
            layout: layouts.stepping,
            entries: [
                { binding: 0, resource: { buffer: reading } },
                // Never written here, but a pass may not read and write one buffer.
                {
                    binding: 1,
                    resource: {
                        buffer:
                            reading === resources.spare[0]
                                ? resources.spare[1]
                                : resources.spare[0],
                    },
                },
            ],
        }),
    );
    compute.dispatchWorkgroups(workgroups(side));
    compute.end();

    const clears = trails <= 0 || fresh;
    const render = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: colour,
                resolveTarget: resolve,
                loadOp: clears ? 'clear' : 'load',
                clearValue: { r: backdrop[0], g: backdrop[1], b: backdrop[2], a: 1 },
                storeOp: 'store',
            },
        ],
        depthStencilAttachment: {
            view: depth,
            depthLoadOp: 'clear',
            depthClearValue: 1,
            depthStoreOp: 'discard',
        },
    });
    render.setBindGroup(0, groups.frame, offsets.frame);
    render.setBindGroup(1, groups.knobs, offsets.knobs);
    render.setBindGroup(
        2,
        device.createBindGroup({
            layout: layouts.reads,
            entries: [{ binding: 1, resource: { buffer: points } }],
        }),
    );
    render.setBindGroup(
        3,
        device.createBindGroup({
            layout: layouts.reading,
            entries: [{ binding: 0, resource: { buffer: reading } }],
        }),
    );

    if (!clears) {
        render.setPipeline(sketch.draws.fade);
        render.draw(3);
    }

    render.setPipeline(
        sketch.draws[mode === 'dots' ? 'dots' : mode === 'lines' ? 'lines' : 'surface'],
    );
    if (mode === 'dots') {
        render.draw(vertexCount(mode, side, prepared.wrap), side * side);
    } else {
        render.draw(vertexCount(mode, side, prepared.wrap));
    }

    if (params.axes) {
        render.setPipeline(sketch.draws.axes);
        render.draw(AXIS_VERTICES);
    }

    render.end();
    device.queue.submit([encoder.finish()]);
};
