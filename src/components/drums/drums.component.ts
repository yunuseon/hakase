import { ListenIcon } from '../../shared/ui/icon.component.ts';
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
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import {
    ACCENT,
    DRUM_LABELS,
    DRUMS,
    isDrum,
    beatOf,
    type Drums,
    type DrumsCommand,
} from '../../model/drums.ts';
import { between, type Cell } from './stroke.ts';
import css from './drums.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = () =>
    html`<div class="ui-staged">
        <div data-stage>
            <div class="bar">
                <button
                    class="ui-listen listen"
                    type="button"
                    aria-pressed="false"
                    title="Listen: the drums play while their clock does"
                >
                    ${ListenIcon()}<span>Listen</span>
                </button>
            </div>
            <div class="grid" role="grid" aria-label="pattern" data-scrolls></div>
        </div>
        <slot name="controls" data-detail></slot>
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
                const cell = cellOf(element);

                // A click with no pointer behind it is the keyboard's: a pointer's tap was already sent by its stroke.
                return element?.closest('.listen')
                    ? [{ kind: 'listen' }]
                    : cell !== null && event.detail === 0
                      ? [command({ kind: 'tap', ...cell })]
                      : [];
            }),
        );

        this.changes$ = merge(strokes$, clicks$);
    }

    connect$(
        drums$: Observable<Drums>,
        t$: Observable<number>,
        listening$: Observable<boolean>,
    ): Observable<void> {
        const shadow = this.shadow;
        const grid = requireChild(shadow, '.grid');
        const listen = requireChild(shadow, '.listen');

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
            this.gridView.lifetime$,
            merge(built$, marked$, now$, listened$).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-drums', HksDrums);
