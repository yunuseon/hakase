import { merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { isFocusPhase, PHASES, ROUNDS, type FocusCommand, type FocusView } from './focus.ts';
import css from './focus.css?inline';

const sheet = styleSheet(css);

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const TEMPLATE = `
    <div class="dial">
        <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle class="track" cx="50" cy="50" r="${RADIUS}" />
            <circle class="arc" cx="50" cy="50" r="${RADIUS}" stroke-dasharray="${CIRCUMFERENCE}" />
        </svg>
        <div class="readout">
            <span class="label"></span>
            <span class="clock" role="timer"></span>
            <span class="rounds"></span>
        </div>
    </div>
    <div class="controls">
        <button class="reset" type="button" aria-label="reset" title="back to the first session">↺</button>
        <button class="toggle" type="button"></button>
        <button class="skip" type="button" aria-label="skip" title="skip to the next phase">⏭</button>
    </div>
    <details class="lengths">
        <summary>Lengths</summary>
        <label>Focus <input type="number" min="1" max="180" data-phase="work" /> min</label>
        <label>Short break <input type="number" min="1" max="180" data-phase="short" /> min</label>
        <label>Long break <input type="number" min="1" max="180" data-phase="long" /> min</label>
    </details>
`;

export class HksFocus extends HTMLElement {
    readonly commands$: Observable<FocusCommand>;

    private readonly shadow: ShadowRoot;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        const lengths = requireChild(shadow, '.lengths');

        this.commands$ = merge(
            fromElementEvent$(requireChild(shadow, '.toggle'), 'click').pipe(
                map((): FocusCommand => ({ kind: 'toggle' })),
            ),
            fromElementEvent$(requireChild(shadow, '.reset'), 'click').pipe(
                map((): FocusCommand => ({ kind: 'reset' })),
            ),
            fromElementEvent$(requireChild(shadow, '.skip'), 'click').pipe(
                map((): FocusCommand => ({ kind: 'skip' })),
            ),
            fromElementEvent$(lengths, 'change').pipe(
                mergeMap(({ target }): FocusCommand[] => {
                    const phase =
                        target instanceof HTMLInputElement ? target.dataset['phase'] : undefined;

                    return target instanceof HTMLInputElement &&
                        phase !== undefined &&
                        isFocusPhase(phase) &&
                        Number.isFinite(target.valueAsNumber)
                        ? [{ kind: 'length', phase, minutes: target.valueAsNumber }]
                        : [];
                }),
            ),
        );
    }

    connect$(view$: Observable<FocusView>): Observable<void> {
        const shadow = this.shadow;
        const arc = requireElement(shadow, '.arc', SVGCircleElement);
        const label = requireChild(shadow, '.label');
        const clock = requireChild(shadow, '.clock');
        const rounds = requireChild(shadow, '.rounds');
        const toggle = requireElement(shadow, '.toggle', HTMLButtonElement);

        return merge(
            view$.pipe(
                map(({ progress }) => String(CIRCUMFERENCE * (1 - progress))),
                distinctUntilChanged(),
                tap(offset => {
                    arc.setAttribute('stroke-dashoffset', offset);
                }),
            ),
            view$.pipe(
                map(({ clock: text }) => text),
                distinctUntilChanged(),
                tap(text => {
                    clock.textContent = text;
                }),
            ),
            view$.pipe(
                distinctUntilChanged(
                    (a, b) => a.phase === b.phase && a.round === b.round && a.running === b.running,
                ),
                tap(({ phase, label: text, round, running }) => {
                    this.dataset['phase'] = phase;
                    label.textContent = text;
                    rounds.textContent = Array.from({ length: ROUNDS }, (_, index) =>
                        index < round ? '●' : '○',
                    ).join(' ');
                    toggle.textContent = running ? 'Pause' : 'Start';
                    toggle.toggleAttribute('data-running', running);
                }),
            ),
            ...PHASES.map(phase =>
                view$.pipe(
                    map(({ lengths }) => lengths[phase]),
                    distinctUntilChanged(),
                    tap(minutes => {
                        const input = shadow.querySelector(`[data-phase="${phase}"]`);

                        if (input instanceof HTMLInputElement) {
                            input.valueAsNumber = minutes;
                        }
                    }),
                ),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-focus', HksFocus);
