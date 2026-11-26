// The spec's flag values: the DOM typings declare the WebGPU types but not these objects.
export const STAGE = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 } as const;
export const BUFFER = {
    MAP_READ: 1,
    COPY_SRC: 4,
    COPY_DST: 8,
    VERTEX: 32,
    UNIFORM: 64,
    STORAGE: 128,
} as const;
export const TEXTURE = {
    COPY_SRC: 1,
    COPY_DST: 2,
    TEXTURE_BINDING: 4,
    STORAGE_BINDING: 8,
    RENDER_ATTACHMENT: 16,
} as const;

export const MAP = { READ: 1, WRITE: 2 } as const;
