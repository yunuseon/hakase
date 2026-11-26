import { BUFFER } from '../../lib/gpu.ts';
import { DAB, type Stroke } from '../stroke.ts';
import source from './shaders/dab.wgsl?raw';

export type InkPass = {
    readonly device: GPUDevice;
    readonly pipeline: GPURenderPipeline;
    readonly uniforms: GPUBuffer;
    readonly group: GPUBindGroup;
    dabs: GPUBuffer | null;
    loaded: Stroke | null;
};

const INK_BYTES = 32;

export const createInkPass = (device: GPUDevice, format: GPUTextureFormat): InkPass => {
    const module = device.createShaderModule({ code: source });
    const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module,
            entryPoint: 'dab',
            buffers: [
                {
                    arrayStride: DAB * 4,
                    stepMode: 'instance',
                    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }],
                },
            ],
        },
        fragment: {
            module,
            entryPoint: 'paint',
            // The brush's rule, ink + (1 - ink) * dab, in premultiplied colour as well as alpha.
            targets: [
                {
                    format,
                    blend: {
                        color: { srcFactor: 'one-minus-dst-alpha', dstFactor: 'one' },
                        alpha: { srcFactor: 'one-minus-dst-alpha', dstFactor: 'one' },
                    },
                },
            ],
        },
        primitive: { topology: 'triangle-strip' },
    });
    const uniforms = device.createBuffer({
        size: INK_BYTES,
        usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
    });

    return {
        device,
        pipeline,
        uniforms,
        group: device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: uniforms } }],
        }),
        dabs: null,
        loaded: null,
    };
};

export const releaseInkPass = (ink: InkPass): void => {
    ink.uniforms.destroy();
    ink.dabs?.destroy();
};

export const loadStroke = (ink: InkPass, stroke: Stroke): void => {
    if (ink.loaded === stroke) {
        return;
    }

    const bytes = Math.max(stroke.dabs.byteLength, 16);

    if (ink.dabs === null || ink.dabs.size < bytes) {
        ink.dabs?.destroy();
        ink.dabs = ink.device.createBuffer({ size: bytes, usage: BUFFER.VERTEX | BUFFER.COPY_DST });
    }

    ink.device.queue.writeBuffer(ink.dabs, 0, stroke.dabs);
    ink.loaded = stroke;
};

// The first `count` dabs of the stroke last loaded, onto a cleared target. Its uniforms are written now, so one pass per submit.
export const inked = (
    ink: InkPass,
    encoder: GPUCommandEncoder,
    into: GPUTextureView,
    { hardness }: Stroke,
    count: number,
    { side, colour }: { readonly side: number; readonly colour: readonly [number, number, number] },
): void => {
    ink.device.queue.writeBuffer(
        ink.uniforms,
        0,
        Float32Array.of(colour[0], colour[1], colour[2], 1, 1 / side, hardness, 0, 0),
    );

    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: into,
                loadOp: 'clear',
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                storeOp: 'store',
            },
        ],
    });

    if (count > 0 && ink.dabs !== null) {
        pass.setPipeline(ink.pipeline);
        pass.setBindGroup(0, ink.group);
        pass.setVertexBuffer(0, ink.dabs);
        pass.draw(4, count);
    }

    pass.end();
};
