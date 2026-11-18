import { ListenIcon } from '../../shared/ui/icon.component.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { mountView, type Rendering } from '../../lib/lit.ts';
import { combineLatest, merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import {
    noteName,
    semitonesAt,
    type Heard,
    type Note,
    type VoiceCommand,
} from '../../model/voice.ts';
import css from './voice.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = () =>
    html`<div class="ui-staged">
        <div data-stage>
            <div class="bar">
                <button
                    class="ui-listen listen"
                    type="button"
                    aria-pressed="false"
                    title="Listen: the voice plays while its clock does"
                >
                    ${ListenIcon()}<span>Listen</span>
                </button>
            </div>
            <div class="roll">
                <canvas width="600" height="240"></canvas><span class="cursor"></span
                ><span class="now"></span>
            </div>
            <p class="ui-hint hint" data-detail>
                Plug a signal into <b>pitch</b> in the state menu or in state mode: its value is
                octaves above the root, snapped to the scale. A steps signal plays a melody.
            </p>
        </div>
        <slot name="controls" data-detail></slot>
    </div>`;

export type VoiceEvent =
    { readonly kind: 'command'; readonly command: VoiceCommand } | { readonly kind: 'listen' };

const rollRange = (notes: readonly Note[]) => {
    const heights = notes.map(({ semitones }) => semitones);
    const low = Math.min(0, ...heights);
    const high = Math.max(12, ...heights);

    return { low: low - 1, high: high + 1 };
};

const drawRoll = (canvas: HTMLCanvasElement, notes: readonly Note[], ink: string, rule: string) => {
    const context = canvas.getContext('2d');

    if (context === null) {
        return;
    }

    const { width, height } = canvas;
    const { low, high } = rollRange(notes);
    const row = height / (high - low);
    const yOf = (semitones: number) => height - (semitones - low) * row;

    context.clearRect(0, 0, width, height);
    context.fillStyle = rule;
    Array.from({ length: Math.floor(high / 12) - Math.ceil(low / 12) + 1 }, (_, index) => {
        context.fillRect(0, yOf((Math.ceil(low / 12) + index) * 12), width, 1);
    });
    context.fillStyle = ink;
    notes.forEach(({ from, to, semitones }) => {
        const bar = Math.max(2, row * 0.7);

        context.fillRect(
            from * width + 1,
            yOf(semitones) - bar / 2,
            Math.max(2, (to - from) * width - 2),
            bar,
        );
    });
};

export class HksVoice extends HTMLElement {
    readonly changes$: Observable<VoiceEvent>;

    private readonly shadow: ShadowRoot;

    private readonly rendering: Rendering;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());

        this.changes$ = fromElementEvent$(requireChild(shadow, '.listen'), 'click').pipe(
            map((): VoiceEvent => ({ kind: 'listen' })),
        );
    }

    connect$(
        heard$: Observable<Heard>,
        t$: Observable<number>,
        listening$: Observable<boolean>,
    ): Observable<void> {
        const shadow = this.shadow;
        const canvas = requireElement(shadow, '.roll canvas', HTMLCanvasElement);
        const cursor = requireChild(shadow, '.cursor');
        const now = requireChild(shadow, '.now');
        const hint = requireChild(shadow, '.hint');
        const listen = requireChild(shadow, '.listen');
        const token = (name: string) =>
            getComputedStyle(this).getPropertyValue(name).trim() || '#000000';

        const hinted$ = heard$.pipe(
            map(({ sounding }) => sounding.waves.pitch === null),
            distinctUntilChanged(),
            tap(shown => {
                hint.hidden = !shown;
            }),
        );

        const roll$ = heard$.pipe(
            map(({ notes }) => notes),
            distinctUntilChanged(),
            tap(notes => {
                drawRoll(canvas, notes, token('--ink'), token('--edge'));
            }),
        );

        const moment$ = combineLatest([heard$, t$]).pipe(
            map(([{ sounding }, t]) => ({
                t,
                name: noteName(sounding.voice.root + semitonesAt(sounding, t)),
            })),
            tap(({ t, name }) => {
                cursor.style.setProperty('--t', String(((t % 1) + 1) % 1));
                if (now.textContent !== name) {
                    now.textContent = name;
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
            merge(hinted$, roll$, moment$, listened$).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-voice', HksVoice);
