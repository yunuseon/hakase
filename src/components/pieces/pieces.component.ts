import { concat, merge, of, timer, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, scan, share, switchMap, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import {
    describedCount,
    reduceArmed,
    type Arming,
    type PieceCard,
    type PieceEvent,
} from './pieces.ts';
import css from './pieces.css?inline';

const sheet = styleSheet(css);
const SVG = 'http://www.w3.org/2000/svg';
const DISARM_MS = 3000;

const TEMPLATE = `
    <p class="empty">No pieces yet. Hover a section's label and choose <b>Save as piece</b>: its windows, their states and their wiring are kept here, ready to place again.</p>
    <ul class="cards" aria-label="pieces"></ul>
`;

const dataOf = (target: EventTarget | null, name: string) =>
    target instanceof Element
        ? (target.closest(`[data-${name}]`)?.getAttribute(`data-${name}`) ?? undefined)
        : undefined;

const cardOf = (id: string): HTMLElement => {
    const card = document.createElement('li');
    card.className = 'card';
    card.dataset['card'] = id;

    const preview = document.createElementNS(SVG, 'svg');
    preview.classList.add('preview');
    preview.setAttribute('aria-hidden', 'true');
    preview.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const name = document.createElement('input');
    name.className = 'name';
    name.spellcheck = false;
    name.dataset['rename'] = id;
    name.setAttribute('aria-label', 'piece name');

    const meta = document.createElement('span');
    meta.className = 'meta';

    const place = document.createElement('button');
    place.type = 'button';
    place.className = 'place';
    place.dataset['place'] = id;
    place.textContent = 'Place';
    place.title =
        'Place a fresh copy in view: its states are new, so the saved piece stays as it is';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.dataset['remove'] = id;
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'delete piece');

    const text = document.createElement('div');
    text.className = 'text';
    text.append(name, meta);
    card.append(preview, text, place, remove);

    return card;
};

const drawPreview = (preview: Element, { size, windows }: PieceCard) => {
    preview.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
    preview.replaceChildren(
        ...windows.map(({ x, y, width, height }) => {
            const rect = document.createElementNS(SVG, 'rect');
            rect.setAttribute('x', String(x));
            rect.setAttribute('y', String(y));
            rect.setAttribute('width', String(width));
            rect.setAttribute('height', String(height));
            rect.setAttribute('rx', String(Math.min(width, height) * 0.06));

            return rect;
        }),
    );
};

export class HksPieces extends HTMLElement {
    readonly changes$: Observable<PieceEvent>;

    private readonly shadow: ShadowRoot;
    private readonly armed$: Observable<string | null>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

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
            mergeMap((target): PieceEvent[] => {
                const id = dataOf(target, 'place');

                return id === undefined ? [] : [{ kind: 'place', id }];
            }),
        );

        const removed$ = arming$.pipe(
            mergeMap(({ fired }): PieceEvent[] =>
                fired === null ? [] : [{ kind: 'remove', id: fired }],
            ),
        );

        // On the list, not the host: change is not composed, so it never leaves the shadow root.
        const renamed$ = fromElementEvent$(requireChild(shadow, '.cards'), 'change').pipe(
            mergeMap(({ target }): PieceEvent[] => {
                const id =
                    target instanceof HTMLInputElement ? target.dataset['rename'] : undefined;

                return id === undefined || !(target instanceof HTMLInputElement)
                    ? []
                    : [{ kind: 'rename', id, name: target.value }];
            }),
        );

        this.changes$ = merge(placed$, removed$, renamed$);
    }

    connect$(cards$: Observable<readonly PieceCard[]>): Observable<void> {
        const shadow = this.shadow;
        const list = requireChild(shadow, '.cards');
        const empty = requireChild(shadow, '.empty');

        // In place by id, never rebuilt: a name being typed belongs to its node.
        const shown$ = cards$.pipe(
            tap(cards => {
                const existing = new Map(
                    [...list.children].flatMap(child =>
                        child instanceof HTMLElement && child.dataset['card'] !== undefined
                            ? [[child.dataset['card'], child] as const]
                            : [],
                    ),
                );
                const nodes = cards.map(card => {
                    const node = existing.get(card.id) ?? cardOf(card.id);
                    const name = node.querySelector('.name');
                    const preview = node.querySelector('.preview');

                    if (
                        name instanceof HTMLInputElement &&
                        shadow.activeElement !== name &&
                        name.value !== card.name
                    ) {
                        name.value = card.name;
                    }

                    node.querySelector('.meta')?.replaceChildren(
                        describedCount(card.windows.length),
                    );
                    if (preview !== null) {
                        drawPreview(preview, card);
                    }

                    return node;
                });

                existing.forEach((node, id) => {
                    if (!cards.some(card => card.id === id)) {
                        node.remove();
                    }
                });
                nodes.forEach((node, index) => {
                    if (list.children[index] !== node) {
                        list.insertBefore(node, list.children[index] ?? null);
                    }
                });
                empty.hidden = cards.length > 0;
            }),
        );

        const armedShown$ = this.armed$.pipe(
            tap(armed => {
                for (const button of list.querySelectorAll('.remove')) {
                    const on = button instanceof HTMLElement && button.dataset['remove'] === armed;
                    button.toggleAttribute('data-armed', on);
                    button.textContent = on ? 'Delete?' : '×';
                }
            }),
        );

        return merge(shown$, armedShown$).pipe(map(() => undefined));
    }
}

customElements.define('hks-pieces', HksPieces);
