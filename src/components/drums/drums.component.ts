import { ListenIcon } from '../../shared/ui/icon.component.ts';
import { connectChoices$ } from '../../shared/ui/choices.component.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { repeat } from 'lit-html/directives/repeat.js';

import { mountView, renderView, type RenderView, type Rendering } from '../../lib/lit.ts';
import { combineLatest, concat, merge, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    scan,
    switchMap,
    take,
    takeUntil,
    tap,
} from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import {
    ACCENT,
    DRUM_LABELS,
    DRUMS,
    isDrum,
    isPresetName,
    isRepeat,
    isStepCount,
    MAX_SWING,
    PRESET_NAMES,
    REPEATS,
    STEP_COUNTS,
    beatOf,
    between,
    type Cell,
    type Drums,
    type DrumsCommand,
} from './drums.ts';
import css from './drums.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = () =>
    html`<div class="bar">
            <button
                class="ui-listen listen"
                type="button"
                aria-pressed="false"
                title="Listen: the drums play while their clock does"
            >
                ${ListenIcon()}<span>Listen</span>
            </button>
            <div class="ui-choices presets" aria-label="patterns">
                ${PRESET_NAMES.map(
                    preset =>
                        html`<button
                            class="ui-choice"
                            type="button"
                            data-preset=${ifDefined(preset)}
                        >
                            ${preset}
                        </button>`,
                )}<button class="ui-choice" type="button" data-clear>clear</button>
            </div>
        </div>
        <div class="grid" role="grid" aria-label="pattern"></div>
        <div class="settings">
            <div class="ui-choices steps" role="radiogroup" aria-label="steps">
                ${STEP_COUNTS.map(
                    steps =>
                        html`<button
                            class="ui-choice"
                            type="button"
                            role="radio"
                            data-steps=${ifDefined(steps)}
                        >
                            ${steps}
                        </button>`,
                )}
            </div>
            <div
                class="ui-choices repeats"
                role="radiogroup"
                aria-label="times per loop"
                title="how many times the pattern plays per loop"
            >
                ${REPEATS.map(
                    repeat =>
                        html`<button
                            class="ui-choice"
                            type="button"
                            role="radio"
                            data-repeat=${ifDefined(repeat)}
                        >
                            ×${repeat}
                        </button>`,
                )}
            </div>
            <label class="dial" title="holds back every second step, for a shuffle"
                ><span>swing</span
                ><input
                    class="ui-range"
                    type="range"
                    data-dial="swing"
                    min="0"
                    max=${ifDefined(MAX_SWING)}
                    step="0.01" /><output></output></label
            ><label class="dial" title="how loud; a volume signal swells it"
                ><span>volume</span
                ><input
                    class="ui-range"
                    type="range"
                    data-dial="volume"
                    min="0"
                    max="1"
                    step="0.01" /><output></output
            ></label>
        </div>`;

export type DrumsEvent =
    { readonly kind: 'command'; readonly command: DrumsCommand } | { readonly kind: 'listen' };

const cellOf = (target: Element | null): Cell | null => {
    const cell = target?.closest('[data-cell]');
    const drum = cell?.getAttribute('data-drum') ?? '';
    const step = Number(cell?.getAttribute('data-step'));

    return cell === null || cell === undefined || !isDrum(drum) || !Number.isInteger(step)
        ? null
        : { drum, step };
};

const dataOf = (target: EventTarget | null, name: string) =>
    target instanceof Element
        ? (target.closest(`[data-${name}]`)?.getAttribute(`data-${name}`) ?? null)
        : null;

export class HksDrums extends HTMLElement {
    readonly changes$: Observable<DrumsEvent>;

    private readonly shadow: ShadowRoot;

    private readonly rendering: Rendering;

    private readonly gridView: RenderView<number>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());
        this.gridView = renderView(requireChild(shadow, '.grid'), 0, steps =>
            repeat(
                DRUMS,
                item => item,
                drum =>
                    html`<div class="row" role="row">
                        <span class="drum">${DRUM_LABELS[drum]}</span>${repeat(
                            Array.from({ length: steps }, (_, index) => index),
                            item => item,
                            step =>
                                html`<button
                                    type="button"
                                    class="cell"
                                    data-cell=""
                                    data-drum=${ifDefined(drum)}
                                    data-step=${ifDefined(step)}
                                    data-beat=${ifDefined(beatOf(step, steps) % 2 === 1 ? 'odd' : 'even')}
                                    aria-label=${ifDefined(`${DRUM_LABELS[drum]}, step ${step + 1}`)}
                                ></button>`,
                        )}
                    </div>`,
            ),
        );

        const grid = requireChild(shadow, '.grid');
        const command = (made: DrumsCommand): DrumsEvent => ({ kind: 'command', command: made });

        // Moves are read from the document and hit-tested here, since a touch keeps its first target captured.
        const strokes$ = fromElementEvent$(grid, 'pointerdown').pipe(
            mergeMap(down => {
                const target = down.composedPath()[0];
                const start =
                    down.button === 0 && target instanceof Element ? cellOf(target) : null;

                return start === null ? [] : [{ down, start }];
            }),
            switchMap(({ down, start }) => {
                const ended$ = merge(
                    fromDocumentEvent$('pointerup'),
                    fromDocumentEvent$('pointercancel'),
                ).pipe(filter(end => end.pointerId === down.pointerId));
                const moves$ = fromDocumentEvent$('pointermove').pipe(
                    filter(move => move.pointerId === down.pointerId),
                    takeUntil(ended$),
                );

                // At the first move or the release, not the press: the window raises on the press, and a raise ends the step it follows.
                return concat(
                    merge(moves$, ended$).pipe(
                        take(1),
                        map(() => command({ kind: 'tap', ...start })),
                    ),
                    moves$.pipe(
                        map(move => cellOf(shadow.elementFromPoint(move.clientX, move.clientY))),
                        filter((cell): cell is Cell => cell !== null),
                        distinctUntilChanged((a, b) => a.drum === b.drum && a.step === b.step),
                        scan(
                            ({ last }: { last: Cell; path: readonly Cell[] }, cell) => ({
                                last: cell,
                                path: between(last, cell),
                            }),
                            { last: start, path: [] },
                        ),
                        mergeMap(({ path }) => path),
                        map(cell => command({ kind: 'paint', ...cell, like: start })),
                    ),
                );
            }),
        );

        const clicks$ = fromElementEvent$(this, 'click').pipe(
            mergeMap((event): DrumsEvent[] => {
                const target = event.composedPath()[0] ?? null;
                const element = target instanceof Element ? target : null;
                const preset = dataOf(target, 'preset');
                const steps = Number(dataOf(target, 'steps'));
                const repeat = Number(dataOf(target, 'repeat'));
                const cell = cellOf(element);

                // A click with no pointer behind it is the keyboard's: a pointer's tap was already sent by its stroke.
                return element?.closest('.listen')
                    ? [{ kind: 'listen' }]
                    : cell !== null && event.detail === 0
                      ? [command({ kind: 'tap', ...cell })]
                      : preset !== null && isPresetName(preset)
                        ? [command({ kind: 'preset', preset })]
                        : element?.closest('[data-clear]')
                          ? [command({ kind: 'clear' })]
                          : isStepCount(steps)
                            ? [command({ kind: 'steps', steps })]
                            : isRepeat(repeat)
                              ? [command({ kind: 'repeat', repeat })]
                              : [];
            }),
        );

        const dials$ = fromElementEvent$(requireChild(shadow, '.settings'), 'input').pipe(
            mergeMap(({ target }): DrumsEvent[] => {
                if (!(target instanceof HTMLInputElement)) {
                    return [];
                }

                const value = Number(target.value);

                return target.dataset['dial'] === 'swing'
                    ? [command({ kind: 'swing', swing: value })]
                    : target.dataset['dial'] === 'volume'
                      ? [command({ kind: 'volume', volume: value })]
                      : [];
            }),
        );

        this.changes$ = merge(strokes$, clicks$, dials$);
    }

    connect$(
        drums$: Observable<Drums>,
        t$: Observable<number>,
        listening$: Observable<boolean>,
    ): Observable<void> {
        const shadow = this.shadow;
        const grid = requireChild(shadow, '.grid');
        const listen = requireChild(shadow, '.listen');

        const checked = (name: string, value: string) => {
            for (const button of shadow.querySelectorAll(`[data-${name}]`)) {
                button.setAttribute(
                    'aria-checked',
                    String(button.getAttribute(`data-${name}`) === value),
                );
            }
        };

        const dialed = (name: string, value: number, shown: string) => {
            const input = requireElement(shadow, `[data-dial="${name}"]`, HTMLInputElement);

            if (input.value !== String(value)) {
                input.value = String(value);
            }

            const output = input.parentElement?.querySelector('output');

            if (output) {
                output.textContent = shown;
            }
        };

        // Rebuilt only when the step count changes; every other edit only marks the cells already there.
        const built$ = drums$.pipe(
            map(({ steps }) => steps),
            distinctUntilChanged(),
            tap(steps => {
                grid.style.setProperty('--steps', String(steps));
                this.gridView.update(steps);
            }),
        );

        const marked$ = drums$.pipe(
            tap(drums => {
                for (const cell of grid.querySelectorAll('[data-cell]')) {
                    const drum = cell.getAttribute('data-drum') ?? '';
                    const velocity = isDrum(drum)
                        ? (drums.pattern[drum][Number(cell.getAttribute('data-step'))] ?? 0)
                        : 0;
                    const mark = velocity === 0 ? 'off' : velocity >= ACCENT ? 'accent' : 'on';

                    if (cell.getAttribute('data-velocity') !== mark) {
                        cell.setAttribute('data-velocity', mark);
                    }
                }

                checked('steps', String(drums.steps));
                checked('repeat', String(drums.repeat));
                dialed('swing', drums.swing, `${Math.round((drums.swing / MAX_SWING) * 100)}%`);
                dialed('volume', drums.volume, `${Math.round(drums.volume * 100)}%`);
            }),
        );

        const now$ = combineLatest([drums$, t$]).pipe(
            map(([{ steps, repeat }, t]) => Math.floor(((((t * repeat) % 1) + 1) % 1) * steps)),
            distinctUntilChanged(),
            tap(step => {
                for (const cell of grid.querySelectorAll('[data-now]')) {
                    cell.removeAttribute('data-now');
                }
                for (const cell of grid.querySelectorAll(`[data-step="${step}"]`)) {
                    cell.setAttribute('data-now', '');
                }
            }),
        );

        const listened$ = listening$.pipe(
            distinctUntilChanged(),
            tap(on => {
                listen.setAttribute('aria-pressed', String(on));
            }),
        );

        return merge(
            this.rendering.lifetime$,
            connectChoices$(this.shadow),
            this.gridView.lifetime$,
            merge(built$, marked$, now$, listened$).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-drums', HksDrums);
