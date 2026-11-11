export type Target = {
    readonly width: number;
    readonly height: number;
    readonly texture: WebGLTexture;
    readonly framebuffer: WebGLFramebuffer;
};

export type Multisampled = Target & {
    readonly samples: WebGLFramebuffer;
    readonly colour: WebGLRenderbuffer;
    readonly depth: WebGLRenderbuffer;
};

const SAMPLES = 4;

const textureOf = (gl: WebGL2RenderingContext, width: number, height: number) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return texture;
};

export const createTarget = (gl: WebGL2RenderingContext, width: number, height: number): Target => {
    const texture = textureOf(gl, width, height);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { width, height, texture, framebuffer };
};

export const createMultisampled = (
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
): Multisampled => {
    const resolved = createTarget(gl, width, height);
    const samples = Math.min(SAMPLES, Number(gl.getParameter(gl.MAX_SAMPLES)) || 1);
    const colour = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, colour);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, width, height);
    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorageMultisample(
        gl.RENDERBUFFER,
        samples,
        gl.DEPTH_COMPONENT24,
        width,
        height,
    );
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colour);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { ...resolved, samples: framebuffer, colour, depth };
};

export const resolve = (gl: WebGL2RenderingContext, target: Multisampled): void => {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.samples);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.framebuffer);
    gl.blitFramebuffer(
        0,
        0,
        target.width,
        target.height,
        0,
        0,
        target.width,
        target.height,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
    );
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
};

export const releaseTarget = (gl: WebGL2RenderingContext, target: Target): void => {
    gl.deleteTexture(target.texture);
    gl.deleteFramebuffer(target.framebuffer);

    if ('samples' in target && target.samples instanceof WebGLFramebuffer) {
        gl.deleteFramebuffer(target.samples);
    }
    if ('colour' in target && target.colour instanceof WebGLRenderbuffer) {
        gl.deleteRenderbuffer(target.colour);
    }
    if ('depth' in target && target.depth instanceof WebGLRenderbuffer) {
        gl.deleteRenderbuffer(target.depth);
    }
};
