import {
    GLSL_MESSAGE,
    readableMessages,
    writtenInGlsl,
} from '../components/sketch/gpu/sketch-program.ts';
import { sceneKnobAt, type TracedImage } from '../image.ts';
import { BUFFER, STAGE } from '../lib/gpu.ts';
import {
    MAX_OBJECTS,
    OBJECT_VEC4S,
    SCENE_KNOBS,
    objectUniforms,
    sceneAdapter,
    type Shape,
} from '../model/scene.ts';
import { orbitUniform } from '../model/sketch/space.ts';
import traceSource from './shaders/trace.wgsl?raw';
import type { Target } from './targets.ts';
import type { Pass } from './pacing.ts';

const PRELUDE = traceSource.trimEnd();
// The code is spliced after the prelude, so compiler line numbers need rebasing.
const PRELUDE_LINES = PRELUDE.split('\n').length;

export type Tracing = {
    readonly layout: GPUBindGroupLayout;
    readonly pipelines: GPUPipelineLayout;
    readonly settings: GPUBuffer;
    readonly objects: GPUBuffer;
};

const TRACE_BYTES = 112;
const OBJECT_BYTES = MAX_OBJECTS * OBJECT_VEC4S * 16;

export const createTracing = (device: GPUDevice): Tracing => {
    const layout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: STAGE.COMPUTE, buffer: { type: 'uniform' } },
            { binding: 1, visibility: STAGE.COMPUTE, buffer: { type: 'uniform' } },
            { binding: 2, visibility: STAGE.COMPUTE, texture: { sampleType: 'float' } },
            { binding: 3, visibility: STAGE.COMPUTE, sampler: { type: 'filtering' } },
            {
                binding: 4,
                visibility: STAGE.COMPUTE,
                texture: { sampleType: 'unfilterable-float' },
            },
            {
                binding: 5,
                visibility: STAGE.COMPUTE,
                storageTexture: { access: 'write-only', format: 'rgba32float' },
            },
        ],
    });

    return {
        layout,
        pipelines: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        settings: device.createBuffer({
            size: TRACE_BYTES,
            usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
        }),
        objects: device.createBuffer({
            size: OBJECT_BYTES,
            usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
        }),
    };
};

export const releaseTracing = ({ settings, objects }: Tracing): void => {
    settings.destroy();
    objects.destroy();
};

export type Tracer = { readonly pipeline: GPUComputePipeline };

export type TracerResult =
    | { readonly ok: true; readonly tracer: Tracer }
    | { readonly ok: false; readonly message: string };

export const createTracer = async (
    device: GPUDevice,
    tracing: Tracing,
    code: string,
    shapes: readonly Shape[] = [],
): Promise<TracerResult> => {
    if (writtenInGlsl(code)) {
        return { ok: false, message: GLSL_MESSAGE };
    }

    const module = device.createShaderModule({
        code: `${PRELUDE}\n${code}\n${sceneAdapter(code, shapes)}`,
    });
    const errors = readableMessages((await module.getCompilationInfo()).messages, PRELUDE_LINES);

    if (errors !== '') {
        return { ok: false, message: errors };
    }

    try {
        return {
            ok: true,
            tracer: {
                pipeline: await device.createComputePipelineAsync({
                    layout: tracing.pipelines,
                    compute: { module, entryPoint: 'main' },
                }),
            },
        };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
};

const sunOf = (turn: number, height: number): readonly [number, number, number] => {
    const around = turn * 2 * Math.PI;
    const up = height * (Math.PI / 2);

    return [Math.cos(up) * Math.sin(around), Math.sin(up), Math.cos(up) * Math.cos(around)];
};

// Must match struct Trace in trace.wgsl, field for field.
const traceData = (
    image: TracedImage,
    into: Target,
    t: number,
    { slots, phase, count, batch }: Pass,
): ArrayBuffer => {
    const { scene } = image;
    const bytes = new ArrayBuffer(TRACE_BYTES);
    const floats = new Float32Array(bytes);
    const ints = new Int32Array(bytes);

    floats.set([into.width, into.height, t, scene.light], 0);
    floats.set([...orbitUniform(scene.orbit), 0], 4);
    floats.set([...sunOf(scene.sun, scene.height), scene.sky], 8);
    floats.set(
        SCENE_KNOBS.map(knob => sceneKnobAt(image, knob, t)),
        12,
    );
    ints.set([Math.min(MAX_OBJECTS, scene.objects.length), batch, slots, phase], 16);
    ints.set([count, scene.bounces, 0, 0], 20);
    floats.set([scene.fov, 0, 0, 0], 24);

    return bytes;
};

// One batch per submit: its settings are written just before, and the next batch writes over them.
export const traceBatch = (
    device: GPUDevice,
    tracing: Tracing,
    tracer: Tracer,
    image: TracedImage,
    into: Target,
    previous: Target,
    palette: { readonly view: GPUTextureView; readonly sampler: GPUSampler },
    t: number,
    pass: Pass,
): void => {
    const objects = new Float32Array(OBJECT_BYTES / 4);
    objects.set(objectUniforms(image.scene.objects));
    device.queue.writeBuffer(tracing.settings, 0, traceData(image, into, t, pass));
    device.queue.writeBuffer(tracing.objects, 0, objects);

    const encoder = device.createCommandEncoder();
    const compute = encoder.beginComputePass();
    compute.setPipeline(tracer.pipeline);
    compute.setBindGroup(
        0,
        device.createBindGroup({
            layout: tracing.layout,
            entries: [
                { binding: 0, resource: { buffer: tracing.settings } },
                { binding: 1, resource: { buffer: tracing.objects } },
                { binding: 2, resource: palette.view },
                { binding: 3, resource: palette.sampler },
                { binding: 4, resource: previous.view },
                { binding: 5, resource: into.view },
            ],
        }),
    );
    compute.dispatchWorkgroups(Math.ceil(into.width / 8), Math.ceil(into.height / 8));
    compute.end();
    device.queue.submit([encoder.finish()]);
};
