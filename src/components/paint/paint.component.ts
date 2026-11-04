import { combineLatest, merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, scan, share, tap } from 'rxjs/operators';
import { parseHexColor } from '../../lib/color.ts';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { pointerGesture$ } from '../../shared/drag.ts';
import { isSide, SIZES, type Frame } from '../../shared/picture.ts';
import {
    ACTIONS,
    isAction,
    isBrushField,
    isTool,
    MAX_BRUSH,
    TOOLS,
    type PaintEvent,
    type PaintView,
    type Tool,
} from './paint.ts';
import {
    guidesOf,
    isSymmetry,
    symmetryGlyph,
    SYMMETRIES,
    type Point,
    type Symmetry,
} from '../../shared/brush.ts';
import css from './paint.css?inline';

const sheet = styleSheet(css);
const SVG = 'http://www.w3.org/2000/svg';

const TOOL_GLYPHS: Readonly<Record<Tool, string>> = {
    brush: 'M5 19 C5 15 8 14 10 14 L18 6 L20 8 L12 16 C12 18 10 20 5 19 Z',
    erase: 'M8 19 H19 M5 14 L12 7 L18 13 L12 19 H9 Z M9 10 L15 16',
    soften: 'M12 4 C15 9 18 11 18 14.5 A6 6 0 0 1 6 14.5 C6 11 9 9 12 4 Z',
    fill: 'M6 11 L12 5 L18 11 L12 17 Z M18 13 C19.5 15 20 16 20 17 A2 2 0 0 1 16 17 C16 16 16.5 15 18 13 Z',
};

const TOOL_KEYS: Readonly<Record<Tool, string>> = {
    brush: 'b',
    erase: 'e',
    soften: 's',
    fill: 'f',
};

const SYMMETRY_TITLES: Readonly<Record<Symmetry, string>> = {
    none: 'no symmetry',
    mirror: 'mirror left and right',
    quad: 'mirror both ways',
    'spin-3': 'three turns',
    'spin-6': 'six turns',
    kaleido: 'kaleidoscope: six turns, mirrored',
};

const dial = (field: string, label: string, min: number, max: number, step: number) => `
    <label class="dial" title="${label}">
        <span>${label}</span>
        <input type="range" data-brush="${field}" min="${min}" max="${max}" step="${step}" />
        <output data-read="${field}"></output>
    </label>`;

const TEMPLATE = `
    <div class="bar">
        <div class="tools" role="radiogroup" aria-label="tool">
            ${TOOLS.map(
                tool => `
                <button type="button" role="radio" data-tool="${tool}" title="${tool} (${TOOL_KEYS[tool].toUpperCase()})" aria-label="${tool}">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${TOOL_GLYPHS[tool]}"/></svg>
                </button>`,
            ).join('')}
        </div>
        ${dial('size', 'size', 1, MAX_BRUSH, 1)}
        ${dial('hardness', 'edge', 0, 1, 0.05)}
        ${dial('flow', 'flow', 0.05, 1, 0.05)}
        <div class="symmetries" role="radiogroup" aria-label="symmetry">
            ${SYMMETRIES.map(
                symmetry => `
                <button type="button" role="radio" data-symmetry="${symmetry}" title="${SYMMETRY_TITLES[symmetry]}" aria-label="${SYMMETRY_TITLES[symmetry]}">
                    ${symmetryGlyph(symmetry)}
                </button>`,
            ).join('')}
        </div>
    </div>
    <div class="stage" tabindex="0" aria-label="painting: arrow keys shift it, [ and ] size the brush, comma and full stop step through frames">
        <div class="sheet">
            <canvas class="onion" width="1" height="1"></canvas>
            <canvas class="ink" width="1" height="1"></canvas>
            <svg class="guides" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
            <div class="cursor" hidden></div>
        </div>
    </div>
    <div class="frames">
        <ol class="strip" aria-label="frames"></ol>
        <button type="button" class="key" data-add title="add a frame: a copy of this one" aria-label="add a frame">+</button>
        <button type="button" class="key" data-remove title="delete this frame" aria-label="delete this frame">−</button>
        <button type="button" class="toggle" data-fade aria-pressed="false" title="fade each frame into the next as the loop plays">fade</button>
        <button type="button" class="toggle" data-onion aria-pressed="false" title="show the frame before this one faintly underneath">onion</button>
    </div>
    <div class="foot">
        <div class="sides" role="radiogroup" aria-label="resolution">
            ${SIZES.map(
                size =>
                    `<button type="button" role="radio" data-side="${size}" title="${size} × ${size} pixels">${size}</button>`,
            ).join('')}
        </div>
        <div class="actions">
            ${ACTIONS.map(action => `<button type="button" data-action="${action}">${action}</button>`).join('')}
        </div>
    </div>
`;

const dataOf = (target: EventTarget | null, name: string) =>
    target instanceof Element
        ? (target.closest(`[data-${name}]`)?.getAttribute(`data-${name}`) ?? null)
        : null;

type Segment = { readonly from: Point; readonly to: Point; readonly start: boolean } | null;

const drawn = (canvas: HTMLCanvasElement, frame: Frame, side: number, hex: string) => {
    const context = canvas.getContext('2d');

    if (context === null) {
        return;
    }

    if (canvas.width !== side) {
        canvas.width = side;
        canvas.height = side;
    }

    const { r, g, b } = parseHexColor(hex);
    const image = context.createImageData(side, side);

    frame.forEach((ink, index) => {
        image.data[index * 4] = Math.round(r * 255);
        image.data[index * 4 + 1] = Math.round(g * 255);
        image.data[index * 4 + 2] = Math.round(b * 255);
        image.data[index * 4 + 3] = ink;
    });
    context.putImageData(image, 0, 0);
};

export class HksPaint extends HTMLElement {
    readonly changes$: Observable<PaintEvent>;

    private readonly shadow: ShadowRoot;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        const paper = requireChild(shadow, '.sheet');
        const stage = requireChild(shadow, '.stage');
        // From the host, as what was really clicked: inside a shadow root the event is retargeted to it.
        const clicks$ = fromElementEvent$(this, 'click').pipe(
            map(event => event.composedPath()[0] ?? null),
            share(),
        );

        const strokes$ = pointerGesture$(paper).pipe(
            map(({ phase, event }) => {
                const rect = paper.getBoundingClientRect();

                return {
                    phase,
                    at: {
                        x: (event.clientX - rect.left) / Math.max(rect.width, 1),
                        y: (event.clientY - rect.top) / Math.max(rect.height, 1),
                    },
                };
            }),
            scan(
                (last: { segment: Segment; at: Point }, { phase, at }) => ({
                    at,
                    segment:
                        phase === 'release'
                            ? null
                            : {
                                  from: phase === 'grab' ? at : last.at,
                                  to: at,
                                  start: phase === 'grab',
                              },
                }),
                { segment: null, at: { x: 0, y: 0 } },
            ),
            mergeMap(({ segment }): PaintEvent[] =>
                segment === null ? [] : [{ kind: 'stroke', ...segment }],
            ),
        );

        const keys$ = fromElementEvent$(stage, 'keydown').pipe(
            mergeMap((event): PaintEvent[] => {
                const shifts: Readonly<Record<string, readonly [number, number]>> = {
                    ArrowLeft: [-1, 0],
                    ArrowRight: [1, 0],
                    ArrowUp: [0, -1],
                    ArrowDown: [0, 1],
                };
                const shift = Object.entries(shifts).find(([key]) => key === event.key)?.[1];
                const tool = TOOLS.find(each => TOOL_KEYS[each] === event.key.toLowerCase());
                const found: PaintEvent | null =
                    event.metaKey || event.ctrlKey || event.altKey
                        ? null
                        : shift !== undefined
                          ? { kind: 'shift', dx: shift[0], dy: shift[1] }
                          : event.key === '['
                            ? { kind: 'grow', by: -1 }
                            : event.key === ']'
                              ? { kind: 'grow', by: 1 }
                              : event.key === ','
                                ? { kind: 'step-frame', by: -1 }
                                : event.key === '.'
                                  ? { kind: 'step-frame', by: 1 }
                                  : tool !== undefined
                                    ? { kind: 'tool', tool }
                                    : null;

                // Taken, or the canvas reads the arrows as steps between sections.
                if (found !== null) {
                    event.preventDefault();
                }

                return found === null ? [] : [found];
            }),
        );

        const picked$ = clicks$.pipe(
            mergeMap((target): PaintEvent[] => {
                const tool = dataOf(target, 'tool');
                const symmetry = dataOf(target, 'symmetry');
                const side = Number(dataOf(target, 'side'));
                const action = dataOf(target, 'action');
                const frame = dataOf(target, 'frame');

                return tool !== null && isTool(tool)
                    ? [{ kind: 'tool', tool }]
                    : symmetry !== null && isSymmetry(symmetry)
                      ? [{ kind: 'symmetry', symmetry }]
                      : isSide(side)
                        ? [{ kind: 'side', side }]
                        : action !== null && isAction(action)
                          ? [{ kind: 'action', action }]
                          : frame !== null
                            ? [{ kind: 'select', frame: Number(frame) }]
                            : dataOf(target, 'add') !== null
                              ? [{ kind: 'add-frame' }]
                              : dataOf(target, 'remove') !== null
                                ? [{ kind: 'remove-frame' }]
                                : dataOf(target, 'fade') !== null
                                  ? [{ kind: 'fade' }]
                                  : dataOf(target, 'onion') !== null
                                    ? [{ kind: 'onion' }]
                                    : [];
            }),
        );

        const brushed$ = fromElementEvent$(requireChild(shadow, '.bar'), 'input').pipe(
            mergeMap(({ target }): PaintEvent[] => {
                const field =
                    target instanceof HTMLInputElement ? target.dataset['brush'] : undefined;

                return field !== undefined &&
                    isBrushField(field) &&
                    target instanceof HTMLInputElement
                    ? [{ kind: 'brush', field, value: Number(target.value) }]
                    : [];
            }),
        );

        this.changes$ = merge(strokes$, keys$, picked$, brushed$);
    }

    connect$(view$: Observable<PaintView>, playing$: Observable<number>): Observable<void> {
        const shadow = this.shadow;
        const ink = requireElement(shadow, '.ink', HTMLCanvasElement);
        const onion = requireElement(shadow, '.onion', HTMLCanvasElement);
        const guides = requireElement(shadow, '.guides', SVGSVGElement);
        const cursor = requireChild(shadow, '.cursor');
        const paper = requireChild(shadow, '.sheet');
        const strip = requireChild(shadow, '.strip');
        const colour = (token: string) =>
            getComputedStyle(this).getPropertyValue(token).trim() || '#000000';

        const checked = (name: string, value: string) => {
            for (const button of shadow.querySelectorAll(`[data-${name}]`)) {
                button.setAttribute(
                    'aria-checked',
                    String(button.getAttribute(`data-${name}`) === value),
                );
            }
        };

        const sheet$ = view$.pipe(
            map(({ picture, frame, onion: showing }) => ({
                side: picture.side,
                current: picture.frames[frame] ?? picture.frames[0] ?? [],
                before:
                    showing && picture.frames.length > 1
                        ? (picture.frames[
                              (frame - 1 + picture.frames.length) % picture.frames.length
                          ] ?? null)
                        : null,
            })),
            distinctUntilChanged(
                (a, b) => a.side === b.side && a.current === b.current && a.before === b.before,
            ),
            tap(({ side, current, before }) => {
                drawn(ink, current, side, colour('--ink'));
                onion.hidden = before === null;

                if (before !== null) {
                    drawn(onion, before, side, colour('--accent'));
                }
            }),
        );

        const thumbs$ = view$.pipe(
            map(({ picture }) => picture),
            distinctUntilChanged((a, b) => a.frames === b.frames && a.side === b.side),
            tap(({ frames, side }) => {
                if (strip.children.length !== frames.length) {
                    strip.replaceChildren(
                        ...frames.map((_, index) => {
                            const item = document.createElement('li');
                            const button = document.createElement('button');
                            button.type = 'button';
                            button.dataset['frame'] = String(index);
                            button.setAttribute('aria-label', `frame ${index + 1}`);
                            const thumb = document.createElement('canvas');
                            thumb.width = 1;
                            thumb.height = 1;
                            button.append(thumb);
                            item.append(button);

                            return item;
                        }),
                    );
                }

                frames.forEach((frame, index) => {
                    const thumb = strip.children[index]?.querySelector('canvas');

                    if (thumb instanceof HTMLCanvasElement) {
                        drawn(thumb, frame, side, colour('--ink'));
                    }
                });
            }),
        );

        const marks$ = combineLatest([view$, playing$.pipe(distinctUntilChanged())]).pipe(
            tap(([{ picture, frame }, playing]) => {
                for (const button of strip.querySelectorAll('[data-frame]')) {
                    const index = Number(button.getAttribute('data-frame'));
                    button.setAttribute('aria-current', String(index === frame));
                    button.toggleAttribute(
                        'data-playing',
                        index === playing && picture.frames.length > 1,
                    );
                }
            }),
        );

        const controls$ = view$.pipe(
            tap(({ tool, size, hardness, flow, symmetry, picture, onion: showing }) => {
                checked('tool', tool);
                checked('symmetry', symmetry);
                checked('side', String(picture.side));
                requireChild(shadow, '[data-fade]').setAttribute(
                    'aria-pressed',
                    String(picture.fade),
                );
                requireChild(shadow, '[data-onion]').setAttribute('aria-pressed', String(showing));
                requireElement(shadow, '[data-remove]', HTMLButtonElement).disabled =
                    picture.frames.length <= 1;

                const values = { size, hardness, flow };

                for (const [field, value] of Object.entries(values)) {
                    const input = requireElement(
                        shadow,
                        `[data-brush="${field}"]`,
                        HTMLInputElement,
                    );

                    if (input.value !== String(value)) {
                        input.value = String(value);
                    }

                    requireChild(shadow, `[data-read="${field}"]`).textContent =
                        field === 'size' ? String(value) : value.toFixed(2);
                }

                guides.replaceChildren(
                    ...guidesOf(symmetry).map(path => {
                        const line = document.createElementNS(SVG, 'path');
                        line.setAttribute('d', path);

                        return line;
                    }),
                );
                paper.dataset['tool'] = tool;
            }),
        );

        const pointer$ = merge(
            fromElementEvent$(paper, 'pointermove').pipe(
                map(event => {
                    const rect = paper.getBoundingClientRect();

                    return {
                        x: (event.clientX - rect.left) / Math.max(rect.width, 1),
                        y: (event.clientY - rect.top) / Math.max(rect.height, 1),
                    };
                }),
            ),
            fromElementEvent$(paper, 'pointerleave').pipe(map(() => null)),
        );

        const cursor$ = combineLatest([
            view$.pipe(
                map(({ size, picture, tool }) => (tool === 'fill' ? 0 : size / picture.side)),
                distinctUntilChanged(),
            ),
            pointer$,
        ]).pipe(
            tap(([across, at]) => {
                cursor.hidden = at === null || across === 0;

                if (at !== null) {
                    cursor.style.setProperty('--x', String(at.x));
                    cursor.style.setProperty('--y', String(at.y));
                    cursor.style.setProperty('--across', String(across));
                }
            }),
        );

        return merge(sheet$, thumbs$, marks$, controls$, cursor$).pipe(map(() => undefined));
    }
}

customElements.define('hks-paint', HksPaint);
