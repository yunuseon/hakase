import { html, svg } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { SymmetryIcon } from '../../shared/brush-icon.component.ts';

import { mountView, renderView, type RenderView, type Rendering } from '../../lib/lit.ts';
import { combineLatest, merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { parseHexColor } from '../../lib/color.ts';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { guidesOf, isSymmetry, SYMMETRIES } from '../../shared/brush.ts';
import { createInkPass, inked, loadStroke, type InkPass } from '../../shared/gl/ink.ts';
import { dabCount, dabsAt, type Stroke } from '../../shared/stroke.ts';
import {
    isMode,
    MAX_WEIGHT,
    MIN_WEIGHT,
    MODES,
    penAt,
    type Drawing,
    type PenCommand,
} from './pen.ts';
import css from './pen.css?inline';

const sheet = styleSheet(css);
const SHEET = 768;

const TEMPLATE = () =>
    html`<div class="bar">
            <div class="modes" role="radiogroup" aria-label="mode">
                ${MODES.map(
                    mode =>
                        html`<button
                            type="button"
                            role="radio"
                            data-mode=${ifDefined(mode)}
                            title=${ifDefined(
                                mode === 'draw'
                                    ? 'the line is drawn across the loop, and starts again with it'
                                    : 'the whole figure at once',
                            )}
                        >
                            ${mode}
                        </button>`,
                )}
            </div>
            <label class="dial" title="how thick the line is; a size signal swells it"
                ><span>weight</span
                ><input
                    type="range"
                    data-weight
                    min=${ifDefined(MIN_WEIGHT)}
                    max=${ifDefined(MAX_WEIGHT)}
                    step="0.25" /><output></output
            ></label>
            <div class="symmetries" role="radiogroup" aria-label="symmetry">
                ${SYMMETRIES.map(
                    symmetry =>
                        html`<button
                            type="button"
                            role="radio"
                            data-symmetry=${ifDefined(symmetry)}
                            aria-label=${ifDefined(symmetry)}
                            title=${ifDefined(symmetry)}
                        >
                            ${SymmetryIcon({ symmetry: symmetry })}
                        </button>`,
                )}
            </div>
        </div>
        <div class="stage">
            <div class="sheet">
                <canvas class="whole" width=${ifDefined(SHEET)} height=${ifDefined(SHEET)}></canvas
                ><canvas class="ink" width=${ifDefined(SHEET)} height=${ifDefined(SHEET)}></canvas
                ><svg
                    class="guides"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                ></svg
                ><span class="tip"></span>
            </div>
        </div>
        <div class="foot">
            <p class="hint">
                Plug signals into <b>x</b> and <b>y</b> in the state menu or in state mode, and the
                pen follows them. Unplugged, it goes round in a circle.
            </p>
        </div>`;

const dataOf = (target: EventTarget | null, name: string) =>
    target instanceof Element
        ? (target.closest(`[data-${name}]`)?.getAttribute(`data-${name}`) ?? null)
        : null;

const rgbOf = (hex: string): readonly [number, number, number] => {
    const { r, g, b } = parseHexColor(hex);

    return [r, g, b];
};

const drawn = (pass: InkPass, stroke: Stroke, count: number, colour: string) => {
    const { gl } = pass;

    gl.viewport(0, 0, SHEET, SHEET);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    inked(pass, stroke, count, { side: SHEET, colour: rgbOf(colour), flip: -1 });
};

export class HksPen extends HTMLElement {
    readonly changes$: Observable<PenCommand>;

    private readonly shadow: ShadowRoot;
    private readonly pass: InkPass;

    private readonly rendering: Rendering;

    private readonly guideView: RenderView<readonly string[]>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());
        this.guideView = renderView<readonly string[]>(
            requireElement(shadow, '.guides', SVGSVGElement),
            [],
            paths =>
                repeat(
                    paths,
                    item => item,
                    path => svg`<path d=${ifDefined(path)}></path>`,
                ),
        );

        const gl = requireElement(shadow, '.ink', HTMLCanvasElement).getContext('webgl2', {
            premultipliedAlpha: true,
            antialias: false,
        });
        if (!(gl instanceof WebGL2RenderingContext)) {
            throw new Error('This browser does not support WebGL2');
        }
        this.pass = createInkPass(gl);

        // From the host, as what was really clicked: inside a shadow root the event is retargeted to it.
        const picked$ = fromElementEvent$(this, 'click').pipe(
            mergeMap((event): PenCommand[] => {
                const target = event.composedPath()[0] ?? null;
                const mode = dataOf(target, 'mode');
                const symmetry = dataOf(target, 'symmetry');

                return mode !== null && isMode(mode)
                    ? [{ kind: 'mode', mode }]
                    : symmetry !== null && isSymmetry(symmetry)
                      ? [{ kind: 'symmetry', symmetry }]
                      : [];
            }),
        );

        const weighed$ = fromElementEvent$(requireChild(shadow, '.bar'), 'input').pipe(
            mergeMap(({ target }): PenCommand[] =>
                target instanceof HTMLInputElement && target.dataset['weight'] !== undefined
                    ? [{ kind: 'weight', weight: Number(target.value) }]
                    : [],
            ),
        );

        this.changes$ = merge(picked$, weighed$);
    }

    connect$(
        drawing$: Observable<Drawing>,
        stroke$: Observable<Stroke>,
        t$: Observable<number>,
    ): Observable<void> {
        const shadow = this.shadow;
        const whole = requireElement(shadow, '.whole', HTMLCanvasElement);
        const ink = requireElement(shadow, '.ink', HTMLCanvasElement);
        const pass = this.pass;
        const tip = requireChild(shadow, '.tip');
        const hint = requireChild(shadow, '.hint');
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

        const controls$ = drawing$.pipe(
            map(({ pen, waves }) => ({ pen, plugged: waves.x !== null && waves.y !== null })),
            tap(({ pen, plugged }) => {
                checked('mode', pen.mode);
                checked('symmetry', pen.symmetry);

                const weight = requireElement(shadow, '[data-weight]', HTMLInputElement);

                if (weight.value !== String(pen.weight)) {
                    weight.value = String(pen.weight);
                }

                requireChild(shadow, '.dial output').textContent = pen.weight.toFixed(1);
                hint.hidden = plugged;
                this.guideView.update(guidesOf(pen.symmetry));
            }),
        );

        // Drawn whole once per stroke and copied out at once, before the live drawing replaces it.
        const figure$ = stroke$.pipe(
            tap(stroke => {
                loadStroke(pass, stroke);
                drawn(pass, stroke, dabCount(stroke), colour('--ink'));
                whole.getContext('2d')?.clearRect(0, 0, SHEET, SHEET);
                whole.getContext('2d')?.drawImage(ink, 0, 0);
            }),
        );

        const now$ = combineLatest([stroke$, t$]).pipe(
            map(([stroke, t]) => ({ stroke, count: dabsAt(stroke, t) })),
            distinctUntilChanged((a, b) => a.stroke === b.stroke && a.count === b.count),
            tap(({ stroke, count }) => {
                drawn(pass, stroke, count, colour('--ink'));
            }),
        );

        const tip$ = combineLatest([drawing$, t$]).pipe(
            map(([drawing, t]) => penAt(drawing, t)),
            tap(({ x, y }) => {
                tip.style.setProperty('--x', String(x));
                tip.style.setProperty('--y', String(y));
            }),
        );

        return merge(
            this.rendering.lifetime$,
            this.guideView.lifetime$,
            merge(controls$, figure$, now$, tip$).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-pen', HksPen);
