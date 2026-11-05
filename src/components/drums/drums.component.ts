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

const SPEAKER = 'M4 9 H8 L13 5 V19 L8 15 H4 Z';
const SOUNDING = 'M16 9 Q18 12 16 15 M18.5 6.5 Q22 12 18.5 17.5';
const SILENT = 'M17 9.5 L22 14.5 M22 9.5 L17 14.5';

const TEMPLATE = `
    <div class="bar">
        <button class="listen" type="button" aria-pressed="false" title="Listen: the drums play while their clock does">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path class="speaker" d="${SPEAKER}"/><path class="on" d="${SOUNDING}"/><path class="off" d="${SILENT}"/></svg>
            <span>Listen</span>
        </button>
        <div class="presets" aria-label="patterns">
            ${PRESET_NAMES.map(
                preset => `<button type="button" data-preset="${preset}">${preset}</button>`,
            ).join('')}
            <button type="button" data-clear>clear</button>
        </div>
    </div>
    <div class="grid" role="grid" aria-label="pattern"></div>
    <div class="settings">
        <div class="steps" role="radiogroup" aria-label="steps">
            ${STEP_COUNTS.map(
                steps =>
                    `<button type="button" role="radio" data-steps="${steps}">${steps}</button>`,
            ).join('')}
        </div>
        <div class="repeats" role="radiogroup" aria-label="times per loop" title="how many times the pattern plays per loop">
            ${REPEATS.map(
                repeat =>
                    `<button type="button" role="radio" data-repeat="${repeat}">×${repeat}</button>`,
            ).join('')}
        </div>
        <label class="dial" title="holds back every second step, for a shuffle">
            <span>swing</span>
            <input type="range" data-dial="swing" min="0" max="${MAX_SWING}" step="0.01" />
            <output></output>
        </label>
        <label class="dial" title="how loud; a volume signal swells it">
            <span>volume</span>
            <input type="range" data-dial="volume" min="0" max="1" step="0.01" />
            <output></output>
        </label>
    </div>
`;

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

const rowsOf = (steps: number) =>
    DRUMS.map(drum => {
        const row = document.createElement('div');
        row.className = 'row';
        row.setAttribute('role', 'row');

        const label = document.createElement('span');
        label.className = 'drum';
        label.textContent = DRUM_LABELS[drum];

        const cells = Array.from({ length: steps }, (_, step) => {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'cell';
            cell.dataset['cell'] = '';
            cell.dataset['drum'] = drum;
            cell.dataset['step'] = String(step);
            cell.dataset['beat'] = beatOf(step, steps) % 2 === 1 ? 'odd' : 'even';
            cell.setAttribute('aria-label', `${DRUM_LABELS[drum]}, step ${step + 1}`);

            return cell;
        });

        row.append(label, ...cells);

        return row;
    });

export class HksDrums extends HTMLElement {
    readonly changes$: Observable<DrumsEvent>;

    private readonly shadow: ShadowRoot;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

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
                grid.replaceChildren(...rowsOf(steps));
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

        return merge(built$, marked$, now$, listened$).pipe(map(() => undefined));
    }
}

customElements.define('hks-drums', HksDrums);
