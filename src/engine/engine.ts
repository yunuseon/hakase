import { evolutionTo, stepAt, type Evolved } from '../components/sketch/evolution.ts';
import { panelParams, samePointer, type Pointer } from '../components/sketch/params.ts';
import {
    createSketch,
    drawFrame,
    knobsUsed,
    prepare,
    type Sketch,
} from '../components/sketch/gl/sketch-program.ts';
import {
    bindState,
    createSimulation,
    evolve,
    releaseSimulation,
    type Simulation,
} from '../components/sketch/gl/simulation.ts';
import {
    createSketchResources,
    PAINT_UNIT,
    releaseSketchResources,
    type SketchResources,
} from '../components/sketch/gl/surface.ts';
import { buildRamp, RAMP_SIZE, type Theme } from '../components/sketch/theme.ts';
import { themes } from '../components/sketch/themes/registry.ts';
import {
    knobAt,
    sameImage,
    stagesOf,
    type Image,
    type PedalImage,
    type PointsImage,
} from '../image.ts';
import { PEDALS, type PedalKind } from '../pedals.ts';
import type { Size } from '../components/window/frame.ts';
import type { Rgb } from '../lib/color.ts';
import { createInkPass, inked, loadStroke, type InkPass } from '../shared/gl/ink.ts';
import { dabCount, type Stroke } from '../shared/stroke.ts';
import { createProgram } from '../shared/gl/program.ts';
import blur from './shaders/blur.frag?raw';
import colourmap from './shaders/colourmap.frag?raw';
import feedback from './shaders/feedback.frag?raw';
import kaleido from './shaders/kaleido.frag?raw';
import mix from './shaders/mix.frag?raw';
import pass from './shaders/pass.vert?raw';
import present from './shaders/present.frag?raw';
import sheet from './shaders/sheet.frag?raw';
import {
    createMultisampled,
    createTarget,
    releaseTarget,
    resolve,
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
};

export type FormulaCheck =
    | { readonly ok: true; readonly knobs: ReturnType<typeof knobsUsed> }
    | { readonly ok: false; readonly message: string };

type Pass = {
    readonly program: WebGLProgram;
    readonly at: (name: string) => WebGLUniformLocation | null;
};

type Prepared = {
    readonly sketch: Sketch;
    readonly image: PointsImage;
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly dotScale: number;
    readonly backdrop: readonly [number, number, number];
};

type Source = {
    readonly resources: SketchResources;
    source: string | null;
    sketch: Sketch | null;
    prepared: Prepared | null;
    simulation: Simulation | null;
    evolved: Evolved | null;
};

type Cooked = {
    readonly image: Image;
    readonly t: number;
    readonly pass: number;
    readonly pointer: Pointer;
    readonly frame: Size | null;
    readonly dotScale: number;
};

type Entry = {
    output: Target;
    readonly samples: Multisampled | null;
    spare: Target | null;
    palette: { readonly texture: WebGLTexture; theme: Theme | null } | null;
    cooked: Cooked | null;
    used: number;
};

export type Engine = {
    readonly canvas: OffscreenCanvas;
    readonly gl: WebGL2RenderingContext;
    readonly vao: WebGLVertexArrayObject;
    readonly blank: WebGLTexture;
    readonly passes: Readonly<Record<PedalKind | 'present' | 'sheet', Pass>>;
    readonly ink: InkPass;
    readonly sheets: Map<string, Sheet>;
    readonly sources: Map<string, Source>;
    readonly entries: Map<string, Entry>;
    readonly checks: Map<string, FormulaCheck>;
};

const REFERENCE_SIDE = 640;
const INPUT_UNIT = 3;
const PALETTE_UNIT = 5;
const PREVIOUS_UNIT = 6;
const KNOB_SLOTS = 8;
const FORGET_MS = 3000;

type Sheet = {
    readonly whole: Target;
    readonly now: Target;
    drawn: { readonly stroke: Stroke; readonly ink: Rgb } | null;
    used: number;
};

export const SHEET_SIDE = 768;

const FRAGMENTS: Readonly<Record<PedalKind | 'present' | 'sheet', string>> = {
    colourmap,
    kaleido,
    feedback,
    mix,
    blur,
    present,
    sheet,
};

const passOf = (gl: WebGL2RenderingContext, fragment: string): Pass => {
    const result = createProgram(gl, pass, fragment);

    if (!result.ok) {
        throw new Error(`An engine pass did not compile: ${result.message}`);
    }

    return { program: result.program, at: name => gl.getUniformLocation(result.program, name) };
};

export const createEngine = (): Engine => {
    const canvas = new OffscreenCanvas(1, 1);
    const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        preserveDrawingBuffer: true,
    });

    if (!(gl instanceof WebGL2RenderingContext)) {
        throw new Error('This browser does not support WebGL2');
    }

    const blank = createTarget(gl, 1, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, blank.framebuffer);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return {
        canvas,
        gl,
        vao: gl.createVertexArray(),
        blank: blank.texture,
        passes: {
            colourmap: passOf(gl, FRAGMENTS.colourmap),
            kaleido: passOf(gl, FRAGMENTS.kaleido),
            feedback: passOf(gl, FRAGMENTS.feedback),
            mix: passOf(gl, FRAGMENTS.mix),
            blur: passOf(gl, FRAGMENTS.blur),
            present: passOf(gl, FRAGMENTS.present),
            sheet: passOf(gl, FRAGMENTS.sheet),
        },
        ink: createInkPass(gl),
        sheets: new Map(),
        sources: new Map(),
        entries: new Map(),
        checks: new Map(),
    };
};

const CHECKS_KEPT = 16;

export const checkFormula = (engine: Engine, text: string): FormulaCheck => {
    const known = engine.checks.get(text);

    if (known !== undefined) {
        return known;
    }

    const result = createSketch(engine.gl, text);
    const check: FormulaCheck = result.ok
        ? { ok: true, knobs: knobsUsed(result.sketch) }
        : { ok: false, message: result.message };

    if (result.ok) {
        engine.gl.deleteProgram(result.sketch.program);
    }

    [...engine.checks.keys()]
        .slice(0, Math.max(0, engine.checks.size - CHECKS_KEPT + 1))
        .forEach(old => engine.checks.delete(old));
    engine.checks.set(text, check);

    return check;
};

export const releaseEngine = ({ gl }: Engine): void => {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
};

const keyOf = (store: string, lane: string): string => (lane === '' ? store : `${store}#${lane}`);

const sourceOf = (engine: Engine, store: string): Source => {
    const known = engine.sources.get(store);

    if (known !== undefined) {
        return known;
    }

    const made: Source = {
        resources: createSketchResources(engine.gl),
        source: null,
        sketch: null,
        prepared: null,
        simulation: null,
        evolved: null,
    };
    engine.sources.set(store, made);

    return made;
};

const releaseSource = (gl: WebGL2RenderingContext, source: Source): void => {
    releaseSketchResources(gl, source.resources);
    if (source.sketch !== null) {
        gl.deleteProgram(source.sketch.program);
    }
    if (source.simulation !== null) {
        releaseSimulation(gl, source.simulation);
    }
};

const entryOf = (engine: Engine, stage: PointsImage | PedalImage, moment: Moment): Entry => {
    const key = `${keyOf(stage.store, moment.lane)}@${moment.width}x${moment.height}`;
    const known = engine.entries.get(key);

    if (known !== undefined) {
        return known;
    }

    const { gl } = engine;
    const samples =
        stage.kind === 'points' ? createMultisampled(gl, moment.width, moment.height) : null;
    const made: Entry = {
        output: samples ?? createTarget(gl, moment.width, moment.height),
        samples,
        spare:
            stage.kind === 'pedal' &&
            (stage.pedal.kind === 'feedback' || stage.pedal.kind === 'blur')
                ? createTarget(gl, moment.width, moment.height)
                : null,
        palette: null,
        cooked: null,
        used: 0,
    };
    engine.entries.set(key, made);

    return made;
};

const samePrepared = (prepared: Prepared | null, next: Omit<Prepared, 'backdrop'>): boolean =>
    prepared !== null &&
    prepared.sketch === next.sketch &&
    prepared.width === next.width &&
    prepared.height === next.height &&
    prepared.scale === next.scale &&
    prepared.dotScale === next.dotScale &&
    prepared.image.panel === next.image.panel &&
    prepared.image.theme === next.image.theme &&
    prepared.image.sheet === next.image.sheet;

const compiled = (gl: WebGL2RenderingContext, source: Source, text: string): Sketch | null => {
    if (source.source === text) {
        return source.sketch;
    }

    source.source = text;
    const result = createSketch(gl, text);

    if (result.ok) {
        if (source.sketch !== null) {
            gl.deleteProgram(source.sketch.program);
        }
        if (source.simulation !== null) {
            releaseSimulation(gl, source.simulation);
        }
        source.sketch = result.sketch;
        source.prepared = null;
        source.simulation = null;
        source.evolved = null;
    }

    return source.sketch;
};

const drawPoints = (engine: Engine, entry: Entry, image: PointsImage, moment: Moment): void => {
    const { gl, canvas } = engine;
    const { width, height, t, seconds, pointer } = moment;
    const scale =
        moment.frame === null
            ? Math.max(width, height) / REFERENCE_SIDE
            : width / Math.max(moment.frame.width, 1);
    const { dotScale } = moment;
    const target = entry.output;
    const source = sourceOf(engine, keyOf(image.store, moment.lane));
    const sketch = compiled(gl, source, image.source);
    const { samples } = entry;

    gl.bindFramebuffer(gl.FRAMEBUFFER, samples?.samples ?? target.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.bindVertexArray(null);

    if (sketch === null) {
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
    } else {
        const params = {
            width: width / scale,
            height: height / scale,
            ...panelParams(image.panel, image.drivers, image.sheet),
            theme: image.theme,
        };
        const surface = { canvas, gl, ...source.resources };

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        if (!samePrepared(source.prepared, { sketch, image, width, height, scale, dotScale })) {
            const ramp = buildRamp(image.theme);
            prepare(surface, sketch, params, ramp, scale, dotScale);
            source.prepared = {
                sketch,
                image,
                width,
                height,
                scale,
                dotScale,
                backdrop: [(ramp[0] ?? 0) / 255, (ramp[1] ?? 0) / 255, (ramp[2] ?? 0) / 255],
            };
        } else {
            // Another sketch was drawn in between, so this one's own textures go back where it reads them.
            const [r, g, b] = source.prepared?.backdrop ?? [0, 0, 0];
            gl.useProgram(sketch.program);
            gl.activeTexture(gl.TEXTURE0 + PAINT_UNIT);
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, source.resources.paint);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, source.resources.palette);
            gl.clearColor(r, g, b, 1);
            gl.enable(gl.DEPTH_TEST);
        }

        if (sketch.evolves) {
            const side = 2 * image.panel.dimension;

            if (source.simulation?.side !== side) {
                if (source.simulation !== null) {
                    releaseSimulation(gl, source.simulation);
                }
                source.simulation = createSimulation(gl, side);
                source.evolved = null;
            }

            const evolution = evolutionTo(source.evolved, stepAt(t, seconds, sketch.steps));
            evolve(surface, sketch, source.simulation, evolution, {
                params,
                seconds,
                pointer,
                orbit: image.orbit,
            });
            bindState(gl, sketch, source.simulation, evolution.end.front);
            source.evolved = evolution.end;
            // Evolving leaves the canvas bound, not this target.
            gl.bindFramebuffer(gl.FRAMEBUFFER, samples?.samples ?? target.framebuffer);
            gl.viewport(0, 0, width, height);
        }

        drawFrame(surface, sketch, params, t, pointer, image.orbit);
    }

    if (samples !== null) {
        resolve(gl, samples);
    }
};

const bindInput = (engine: Engine, slot: number, texture: WebGLTexture | null): void => {
    const { gl } = engine;
    gl.activeTexture(gl.TEXTURE0 + INPUT_UNIT + slot);
    gl.bindTexture(gl.TEXTURE_2D, texture ?? engine.blank);
};

const paletteOf = (engine: Engine, entry: Entry, theme: Theme): WebGLTexture => {
    const { gl } = engine;
    const palette = entry.palette ?? { texture: gl.createTexture(), theme: null };
    entry.palette = palette;

    gl.activeTexture(gl.TEXTURE0 + PALETTE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, palette.texture);

    if (palette.theme !== theme) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            RAMP_SIZE,
            1,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            buildRamp(theme),
        );
        palette.theme = theme;
    }

    return palette.texture;
};

const drawPass = (engine: Engine, into: Target): void => {
    const { gl } = engine;
    gl.bindFramebuffer(gl.FRAMEBUFFER, into.framebuffer);
    gl.viewport(0, 0, into.width, into.height);
    gl.bindVertexArray(engine.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
};

const drawPedal = (
    engine: Engine,
    entry: Entry,
    image: PedalImage,
    inputs: readonly (WebGLTexture | null)[],
    { t, width, height }: Moment,
): void => {
    const { gl } = engine;
    const { kind } = image.pedal;
    const spec = PEDALS[kind];
    const shader = engine.passes[kind];
    const knobs = Array.from({ length: KNOB_SLOTS }, (_, index) => {
        const knob = spec.knobs[index];

        return knob === undefined ? 0 : knobAt(image, knob.name, t);
    });

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(shader.program);
    gl.uniform1fv(shader.at('uKnobs'), knobs);
    gl.uniform1i(
        shader.at('uChoice'),
        Math.max(
            0,
            spec.choices.findIndex(choice => choice === image.pedal.choice),
        ),
    );
    gl.uniform2f(shader.at('uResolution'), width, height);
    bindInput(engine, 0, inputs[0] ?? null);
    bindInput(engine, 1, inputs[1] ?? null);
    gl.uniform1i(shader.at('uIn0'), INPUT_UNIT);
    gl.uniform1i(shader.at('uIn1'), INPUT_UNIT + 1);

    switch (kind) {
        case 'colourmap':
            paletteOf(engine, entry, image.theme ?? themes.paper);
            gl.uniform1i(shader.at('uPalette'), PALETTE_UNIT);
            drawPass(engine, entry.output);
            break;
        case 'feedback': {
            const spare = entry.spare ?? entry.output;
            gl.activeTexture(gl.TEXTURE0 + PREVIOUS_UNIT);
            gl.bindTexture(gl.TEXTURE_2D, entry.output.texture);
            gl.uniform1i(shader.at('uPrevious'), PREVIOUS_UNIT);
            // A new stage has no past: its first frame is the picture itself, not a fade from black.
            if (entry.cooked === null) {
                gl.uniform1fv(shader.at('uKnobs'), [0, ...knobs.slice(1)]);
            }
            drawPass(engine, spare);
            entry.spare = entry.output;
            entry.output = spare;
            break;
        }
        case 'blur': {
            const spare = entry.spare ?? entry.output;
            gl.uniform2f(shader.at('uDirection'), 1, 0);
            drawPass(engine, spare);
            bindInput(engine, 0, spare.texture);
            gl.uniform2f(shader.at('uDirection'), 0, 1);
            drawPass(engine, entry.output);
            break;
        }
        case 'kaleido':
        case 'mix':
            drawPass(engine, entry.output);
            break;
    }

    gl.activeTexture(gl.TEXTURE0);
};

const forget = (engine: Engine, now: number): void => {
    const { gl } = engine;

    engine.entries.forEach((entry, key) => {
        if (now - entry.used > FORGET_MS) {
            releaseTarget(gl, entry.samples ?? entry.output);
            if (entry.spare !== null) {
                releaseTarget(gl, entry.spare);
            }
            if (entry.palette !== null) {
                gl.deleteTexture(entry.palette.texture);
            }
            engine.entries.delete(key);
        }
    });
    engine.sheets.forEach((sheet, key) => {
        if (now - sheet.used > FORGET_MS) {
            releaseTarget(gl, sheet.whole);
            releaseTarget(gl, sheet.now);
            engine.sheets.delete(key);
        }
    });
    engine.sources.forEach((source, store) => {
        if (![...engine.entries.keys()].some(key => key.startsWith(`${store}@`))) {
            releaseSource(gl, source);
            engine.sources.delete(store);
        }
    });
};

const sameFrame = (a: Size | null, b: Size | null): boolean =>
    a === null || b === null ? a === b : a.width === b.width && a.height === b.height;

export const cook = (
    engine: Engine,
    image: Image,
    moment: Moment,
    now: number,
): WebGLTexture | null => {
    const drawn = stagesOf(image).reduce((textures, stage) => {
        const entry = entryOf(engine, stage, moment);
        const fresh =
            entry.cooked !== null &&
            entry.cooked.t === moment.t &&
            entry.cooked.pass === moment.pass &&
            samePointer(entry.cooked.pointer, moment.pointer) &&
            sameFrame(entry.cooked.frame, moment.frame) &&
            entry.cooked.dotScale === moment.dotScale &&
            sameImage(entry.cooked.image, stage);

        if (!fresh) {
            if (stage.kind === 'points') {
                drawPoints(engine, entry, stage, moment);
            } else {
                drawPedal(
                    engine,
                    entry,
                    stage,
                    stage.inputs.map(input =>
                        input.kind === 'none' ? null : (textures.get(input.store) ?? null),
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

        return new Map(textures).set(stage.store, entry.output.texture);
    }, new Map<string, WebGLTexture>());

    forget(engine, now);

    return image.kind === 'none' ? null : (drawn.get(image.store) ?? null);
};

// Exactly what is drawn: an export writes the whole canvas out, so it must be the picture's size.
const grown = (engine: Engine, width: number, height: number): void => {
    const { canvas } = engine;

    if (canvas.width < width || canvas.height < height) {
        canvas.width = Math.max(canvas.width, width);
        canvas.height = Math.max(canvas.height, height);
    }
};

const GROWTH = 512;

const grownSide = (current: number, needed: number, limit: number): number =>
    needed <= current
        ? current
        : Math.min(limit, Math.ceil(Math.max(needed, current * 1.5) / GROWTH) * GROWTH);

// Growing clears the canvas, so a strip reserves its whole width before its first tile; by half at least, or every pinch reallocates.
export const reserved = (engine: Engine, width: number, height: number): void => {
    const { canvas, gl } = engine;
    const dimensions: unknown = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    const limit = dimensions instanceof Int32Array ? (dimensions[0] ?? 4096) : 4096;
    const next = {
        width: grownSide(canvas.width, width, limit),
        height: grownSide(canvas.height, height, limit),
    };

    if (next.width !== canvas.width || next.height !== canvas.height) {
        canvas.width = next.width;
        canvas.height = next.height;
    }
};

export const drawn = (
    engine: Engine,
    texture: WebGLTexture | null,
    width: number,
    height: number,
    x = 0,
    y = 0,
): void => {
    const { gl } = engine;
    const shader = engine.passes.present;

    grown(engine, x + width, y + height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(x, y, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(shader.program);
    bindInput(engine, 0, texture);
    gl.uniform1i(shader.at('uIn0'), INPUT_UNIT);
    gl.bindVertexArray(engine.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
};

// A tile's slot takes the picture's backdrop, then the picture fitted inside it, the way the window frames it.
export const framedIn = (
    engine: Engine,
    texture: WebGLTexture | null,
    slot: { readonly x: number; readonly width: number; readonly height: number },
    box: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    },
    backdrop: readonly [number, number, number],
): void => {
    const { gl } = engine;

    grown(engine, slot.x + slot.width, slot.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(slot.x, 0, slot.width, slot.height);
    gl.clearColor(...backdrop, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
    drawn(engine, texture, box.width, box.height, slot.x + box.x, box.y);
};

export const presented = (
    engine: Engine,
    texture: WebGLTexture | null,
    width: number,
    height: number,
): Promise<ImageBitmap> => {
    drawn(engine, texture, width, height);

    return createImageBitmap(engine.canvas, 0, engine.canvas.height - height, width, height);
};

const inkedInto = (engine: Engine, into: Target, stroke: Stroke, count: number, ink: Rgb): void => {
    const { gl } = engine;

    gl.bindFramebuffer(gl.FRAMEBUFFER, into.framebuffer);
    gl.viewport(0, 0, into.width, into.height);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    inked(engine.ink, stroke, count, {
        side: SHEET_SIDE,
        colour: [ink.r, ink.g, ink.b],
        flip: -1,
    });
    gl.disable(gl.BLEND);
};

const sameRgb = (a: Rgb, b: Rgb): boolean => a.r === b.r && a.g === b.g && a.b === b.b;

// A pen's sheet: its whole figure drawn once per stroke, the line so far on every count, laid on the paper here because the canvas is opaque.
export const sheetOf = (
    engine: Engine,
    key: string,
    stroke: Stroke,
    count: number,
    { ink, paper, faint }: { readonly ink: Rgb; readonly paper: Rgb; readonly faint: number },
    now: number,
): Promise<ImageBitmap> => {
    const { gl } = engine;
    const sheet = engine.sheets.get(key) ?? {
        whole: createTarget(gl, SHEET_SIDE, SHEET_SIDE),
        now: createTarget(gl, SHEET_SIDE, SHEET_SIDE),
        drawn: null,
        used: now,
    };
    engine.sheets.set(key, sheet);
    sheet.used = now;

    loadStroke(engine.ink, stroke);

    if (sheet.drawn?.stroke !== stroke || !sameRgb(sheet.drawn.ink, ink)) {
        inkedInto(engine, sheet.whole, stroke, dabCount(stroke), ink);
        sheet.drawn = { stroke, ink };
    }

    inkedInto(engine, sheet.now, stroke, count, ink);

    const shader = engine.passes.sheet;
    grown(engine, SHEET_SIDE, SHEET_SIDE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, SHEET_SIDE, SHEET_SIDE);
    gl.useProgram(shader.program);
    bindInput(engine, 0, sheet.whole.texture);
    bindInput(engine, 1, sheet.now.texture);
    gl.uniform1i(shader.at('uIn0'), INPUT_UNIT);
    gl.uniform1i(shader.at('uIn1'), INPUT_UNIT + 1);
    gl.uniform3f(shader.at('uPaper'), paper.r, paper.g, paper.b);
    gl.uniform1f(shader.at('uFaint'), faint);
    gl.bindVertexArray(engine.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    forget(engine, now);

    return createImageBitmap(
        engine.canvas,
        0,
        engine.canvas.height - SHEET_SIDE,
        SHEET_SIDE,
        SHEET_SIDE,
    );
};
