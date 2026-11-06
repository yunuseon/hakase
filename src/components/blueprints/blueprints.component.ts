import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { svg, html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { withValue } from '../../lib/lit.ts';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { ref } from 'lit-html/directives/ref.js';

import { renderView, displayValue, type RenderView } from '../../lib/lit.ts';
import { concat, merge, of, timer, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, scan, share, switchMap, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import {
    describedCount,
    reduceArmed,
    type Arming,
    type BlueprintCard,
    type BlueprintEvent,
} from './blueprints.ts';
import css from './blueprints.css?inline';

const sheet = styleSheet(css);
const DISARM_MS = 3000;

const TEMPLATE = (cards: readonly BlueprintCard[]) =>
    html`<ul class="cards" aria-label="blueprints">
            ${repeat(
                cards.map(card => card.id),
                item => item,
                id =>
                    withValue(
                        cards.find(card => card.id === id),
                        card =>
                            html`<li
                                class="card"
                                data-card=${ifDefined(id)}
                                data-builtin=${ifDefined(card.summary !== null ? '' : undefined)}
                            >
                                <svg
                                    class="preview"
                                    aria-hidden="true"
                                    preserveAspectRatio="xMidYMid meet"
                                    viewBox=${ifDefined(`0 0 ${card.size.width} ${card.size.height}`)}
                                >
                                    ${repeat(
                                        card.windows,
                                        (_item, index) => index,
                                        window =>
                                            svg`<rect x=${ifDefined(window.x)} y=${ifDefined(window.y)} width=${ifDefined(window.width)} height=${ifDefined(window.height)} rx=${ifDefined(Math.min(window.width, window.height) * 0.06)}></rect>`,
                                    )}
                                </svg>
                                <div class="text">
                                    <input
                                        class="ui-field name"
                                        spellcheck=${ifDefined(false)}
                                        data-rename=${ifDefined(id)}
                                        aria-label="blueprint name"
                                        ?readonly=${card.summary !== null}
                                        ${ref(element => {
                                            if (element instanceof HTMLInputElement) {
                                                displayValue(element, card.name);
                                            }
                                        })}
                                    /><span class="meta"
                                        >${card.summary ?? describedCount(card.windows.length)}</span
                                    >
                                </div>
                                <button
                                    type="button"
                                    class="place"
                                    data-place=${ifDefined(id)}
                                    title="Place a fresh copy in view: its states are new, so the saved blueprint stays as it is"
                                >
                                    Place</button
                                ><button
                                    type="button"
                                    class="remove"
                                    data-remove=${ifDefined(id)}
                                    aria-label="delete blueprint"
                                >
                                    ×
                                </button>
                            </li>`,
                    ),
            )}
        </ul>
        <p class="ui-empty empty" ?hidden=${cards.some(card => card.summary === null)}>
            Your own blueprints join these: hover a section's label and choose${' '}<b
                >Save as blueprint</b
            >, and its windows, their states and their wiring are kept here, ready to place again.
        </p>`;

const dataOf = (target: EventTarget | null, name: string) =>
    target instanceof Element
        ? (target.closest(`[data-${name}]`)?.getAttribute(`data-${name}`) ?? undefined)
        : undefined;

export class HksBlueprints extends HTMLElement {
    readonly changes$: Observable<BlueprintEvent>;

    private readonly shadow: ShadowRoot;
    private readonly armed$: Observable<string | null>;

    private readonly rendering: RenderView<readonly BlueprintCard[]>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<readonly BlueprintCard[]>(shadow, [], TEMPLATE);

        const clicks$ = fromElementEvent$(this, 'click').pipe(
            map(event => event.composedPath()[0] ?? null),
            share(),
        );

        // One shared scan reads both the arming and the delete, or the two could see different clicks.
        const arming$ = clicks$.pipe(
            mergeMap(target => {
                const id = dataOf(target, 'remove');

                return id === undefined ? [] : [id];
            }),
            switchMap(id =>
                concat(
                    of<Arming>({ kind: 'click', id }),
                    timer(DISARM_MS).pipe(map((): Arming => ({ kind: 'expire' }))),
                ),
            ),
            scan(reduceArmed, { armed: null, fired: null }),
            share(),
        );

        this.armed$ = arming$.pipe(
            map(({ armed }) => armed),
            distinctUntilChanged(),
        );

        const placed$ = clicks$.pipe(
            mergeMap((target): BlueprintEvent[] => {
                const id = dataOf(target, 'place');

                return id === undefined ? [] : [{ kind: 'place', id }];
            }),
        );

        const removed$ = arming$.pipe(
            mergeMap(({ fired }): BlueprintEvent[] =>
                fired === null ? [] : [{ kind: 'remove', id: fired }],
            ),
        );

        // On the list, not the host: change is not composed, so it never leaves the shadow root.
        const renamed$ = fromElementEvent$(requireChild(shadow, '.cards'), 'change').pipe(
            mergeMap(({ target }): BlueprintEvent[] => {
                const id =
                    target instanceof HTMLInputElement ? target.dataset['rename'] : undefined;

                return id === undefined || !(target instanceof HTMLInputElement)
                    ? []
                    : [{ kind: 'rename', id, name: target.value }];
            }),
        );

        this.changes$ = merge(placed$, removed$, renamed$);
    }

    connect$(cards$: Observable<readonly BlueprintCard[]>): Observable<void> {
        const shadow = this.shadow;
        const list = requireChild(shadow, '.cards');

        const shown$ = cards$.pipe(tap(cards => this.rendering.update(cards)));

        const armedShown$ = this.armed$.pipe(
            tap(armed => {
                for (const button of list.querySelectorAll('.remove')) {
                    const on = button instanceof HTMLElement && button.dataset['remove'] === armed;
                    button.toggleAttribute('data-armed', on);
                    button.textContent = on ? 'Delete?' : '×';
                }
            }),
        );

        return merge(
            this.rendering.lifetime$,
            merge(shown$, armedShown$).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-blueprints', HksBlueprints);
