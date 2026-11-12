import { connectChoices$ } from '../../shared/ui/choices.component.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html, svg } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { SymmetryIcon } from '../../shared/brush-icon.component.ts';

import { mountView, renderView, type RenderView, type Rendering } from '../../lib/lit.ts';
import { combineLatest, merge, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { guidesOf, isSymmetry, SYMMETRIES } from '../../shared/brush.ts';
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

const TEMPLATE = () =>
    html`<div class="bar">
            <div class="ui-choices modes" role="radiogroup" aria-label="mode">
                ${MODES.map(
                    mode =>
                        html`<button
                            class="ui-choice"
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
                    class="ui-range"
                    type="range"
                    data-weight
                    min=${ifDefined(MIN_WEIGHT)}
                    max=${ifDefined(MAX_WEIGHT)}
                    step="0.25" /><output></output
            ></label>
            <div class="ui-choices symmetries" role="radiogroup" aria-label="symmetry">
                ${SYMMETRIES.map(
                    symmetry =>
                        html`<button
                            class="ui-choice"
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
                <canvas class="ink"></canvas
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
            <p class="ui-hint hint">
                Plug signals into <b>x</b> and <b>y</b> in the state menu or in state mode, and the
                pen follows them. Unplugged, it goes round in a circle.
            </p>
        </div>`;

const dataOf = (target: EventTarget | null, name: string) =>
    target instanceof Element
        ? (target.closest(`[data-${name}]`)?.getAttribute(`data-${name}`) ?? null)
        : null;

export class HksPen extends HTMLElement {
    readonly changes$: Observable<PenCommand>;

    private readonly shadow: ShadowRoot;

    private readonly rendering: Rendering;

    private readonly guideView: RenderView<readonly string[]>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
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
        sheet$: Observable<ImageBitmap>,
        t$: Observable<number>,
    ): Observable<void> {
        const shadow = this.shadow;
        const ink = requireElement(shadow, '.ink', HTMLCanvasElement).getContext('bitmaprenderer');
        const tip = requireChild(shadow, '.tip');
        const hint = requireChild(shadow, '.hint');

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

        const shown$ = sheet$.pipe(
            tap(bitmap => {
                ink?.transferFromImageBitmap(bitmap);
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
            connectChoices$(this.shadow),
            this.guideView.lifetime$,
            merge(controls$, shown$, tip$).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-pen', HksPen);
