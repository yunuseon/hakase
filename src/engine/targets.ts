import { TEXTURE } from '../lib/gpu.ts';

export type Target = {
    readonly width: number;
    readonly height: number;
    readonly texture: GPUTexture;
    readonly view: GPUTextureView;
};

export type Multisampled = Target & {
    readonly colour: GPUTexture;
    readonly colourView: GPUTextureView;
    readonly depth: GPUTexture;
    readonly depthView: GPUTextureView;
};

export const SAMPLES = 4;
export const FORMAT: GPUTextureFormat = 'rgba8unorm';
export const DEPTH: GPUTextureFormat = 'depth24plus';
export const FLOAT: GPUTextureFormat = 'rgba32float';

export const createTarget = (device: GPUDevice, width: number, height: number): Target => {
    const texture = device.createTexture({
        size: { width, height },
        format: FORMAT,
        usage:
            TEXTURE.RENDER_ATTACHMENT |
            TEXTURE.TEXTURE_BINDING |
            TEXTURE.COPY_SRC |
            TEXTURE.COPY_DST,
    });

    return { width, height, texture, view: texture.createView() };
};

export const createMultisampled = (
    device: GPUDevice,
    width: number,
    height: number,
): Multisampled => {
    const resolved = createTarget(device, width, height);
    const colour = device.createTexture({
        size: { width, height },
        format: FORMAT,
        sampleCount: SAMPLES,
        usage: TEXTURE.RENDER_ATTACHMENT,
    });
    const depth = device.createTexture({
        size: { width, height },
        format: DEPTH,
        sampleCount: SAMPLES,
        usage: TEXTURE.RENDER_ATTACHMENT,
    });

    return {
        ...resolved,
        colour,
        colourView: colour.createView(),
        depth,
        depthView: depth.createView(),
    };
};

// Written as storage by the tracer, and a render target only so a restart can clear it.
export const createFloatTarget = (device: GPUDevice, width: number, height: number): Target => {
    const texture = device.createTexture({
        size: { width, height },
        format: FLOAT,
        usage: TEXTURE.STORAGE_BINDING | TEXTURE.TEXTURE_BINDING | TEXTURE.RENDER_ATTACHMENT,
    });

    return { width, height, texture, view: texture.createView() };
};

export const releaseTarget = (target: Target): void => {
    target.texture.destroy();

    if ('colour' in target && target.colour instanceof GPUTexture) {
        target.colour.destroy();
    }
    if ('depth' in target && target.depth instanceof GPUTexture) {
        target.depth.destroy();
    }
};
