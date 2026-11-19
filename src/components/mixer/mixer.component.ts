import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { merge, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { styleSheet } from '../../lib/dom.ts';
import { renderView, type RenderView } from '../../lib/lit.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { ListenIcon } from '../../shared/ui/icon.component.ts';
import { meterOf, type MixerEvent, type MixerView, type StripView } from './mixer.ts';
import css from './mixer.css?inline';

const sheet = styleSheet(css);

const quiet: MixerView = { listening: false, strips: [] };

const Strip = (strip: StripView) =>
    html`<div
        class="strip"
        data-store=${strip.store}
        ?data-heard=${strip.heard}
        style=${styleMap({ '--colour': strip.colour })}
    >
        <span class="name" title=${strip.name}><span class="dot"></span>${strip.name}</span>
        <div class="channel">
            <span class="meter" aria-hidden="true"><span class="fill"></span></span>
            <input
                class="ui-range fader"
                data-orient="vertical"
                type="range"
                min="0"
                max="1"
                step="0.01"
                aria-label=${`${strip.name} level`}
                data-fader=${strip.store}
                ?disabled=${strip.chain !== null}
                .value=${String(strip.volume)}
            />
        </div>
        ${
            strip.chain === null
                ? html`<output class="value">${strip.percent}</output>`
                : html`<button
                      type="button"
                      class="ui-driven"
                      data-chain=${`level ← ${strip.chain}`}
                  >
                      follows
                  </button>`
        }
        <div class="buttons">
            <button
                class="ui-choice mute"
                type="button"
                data-mute=${strip.store}
                aria-pressed=${String(strip.muted)}
                aria-label=${`mute ${strip.name}`}
                title="mute"
            >
                M
            </button>
            <button
                class="ui-choice solo"
                type="button"
                data-solo=${strip.store}
                aria-pressed=${String(strip.soloed)}
                aria-label=${`solo ${strip.name}`}
                title="solo: only the soloed strips play"
            >
                S
            </button>
        </div>
    </div>`;

const TEMPLATE = ({ listening, strips }: MixerView) =>
    html`<header class="head">
            <button
                class="ui-listen listen"
                type="button"
                aria-pressed=${String(listening)}
                title="Listen: every voice and drum machine plays while its clock does"
            >
                ${ListenIcon()}<span>Listen</span>
            </button>
            <span class="hint" data-detail>
                ${listening ? 'Every voice and drum machine plays.' : 'Sound is off.'}
            </span>
        </header>
        ${
            strips.length === 0
                ? html`<div class="ui-empty empty">
                      <p>No voices or drum machines yet. Each one gets a strip here.</p>
                  </div>`
                : html`<div class="strips" data-scrolls>
                      ${repeat(strips, ({ store }) => store, Strip)}
                  </div>`
        }`;

const dataOf = (target: EventTarget | null, name: string): string | null =>
    target instanceof Element
        ? (target.closest(`[data-${name}]`)?.getAttribute(`data-${name}`) ?? null)
        : null;

export class HksMixer extends HTMLElement {
    readonly changes$: Observable<MixerEvent>;

    private readonly root: HTMLElement;
    private readonly rendering: RenderView<MixerView>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        const root = document.createElement('div');
        root.className = 'mixer';
        shadow.append(root);
        this.root = root;
        this.rendering = renderView(root, quiet, TEMPLATE);

        this.changes$ = merge(
            fromElementEvent$(root, 'click').pipe(
                mergeMap(({ target }): MixerEvent[] => {
                    const mute = dataOf(target, 'mute');
                    const solo = dataOf(target, 'solo');

                    return target instanceof Element && target.closest('.listen') !== null
                        ? [{ kind: 'listen' }]
                        : mute !== null
                          ? [{ kind: 'mute', store: mute }]
                          : solo !== null
                            ? [{ kind: 'solo', store: solo }]
                            : [];
                }),
            ),
            fromElementEvent$(root, 'input').pipe(
                mergeMap(({ target }): MixerEvent[] => {
                    const store = dataOf(target, 'fader');

                    return store !== null && target instanceof HTMLInputElement
                        ? [{ kind: 'volume', store, volume: target.valueAsNumber }]
                        : [];
                }),
            ),
        );
    }

    connect$(
        view$: Observable<MixerView>,
        levels$: Observable<readonly number[]>,
    ): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            view$.pipe(
                tap(view => {
                    this.rendering.update(view);
                }),
            ),
            levels$.pipe(
                tap(levels => {
                    this.root.querySelectorAll('.strip').forEach((strip, index) => {
                        if (strip instanceof HTMLElement) {
                            strip.style.setProperty(
                                '--level',
                                String(
                                    meterOf(levels[index] ?? 0, strip.hasAttribute('data-heard')),
                                ),
                            );
                        }
                    });
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-mixer', HksMixer);
