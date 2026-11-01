import { EMPTY, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    share,
    startWith,
    switchMap,
    take,
    takeWhile,
    tap,
} from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import { DAY_MINUTES, SNAP, snapped, timeOf, type Placed } from './agenda.ts';
import css from './agenda.css?inline';

const sheet = styleSheet(css);

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const FIRST_HOUR = 8;
const NEW_LENGTH = 60;

const TEMPLATE = `
    <header class="bar">
        <button class="prev" type="button" aria-label="previous day">‹</button>
        <button class="today" type="button">Today</button>
        <button class="next" type="button" aria-label="next day">›</button>
        <span class="date"></span>
    </header>
    <div class="scroll">
        <div class="hours">
            ${HOURS.map(hour => `<div class="hour" style="--hour: ${hour}"><span>${timeOf(hour * 60)}</span></div>`).join('')}
            <div class="blocks"></div>
            <div class="ghost" hidden></div>
            <div class="now" hidden></div>
        </div>
    </div>
`;

export type AgendaView = {
    readonly label: string;
    readonly blocks: readonly Placed[];
    readonly now: number | null;
};

export type AgendaChange =
    | { readonly kind: 'create'; readonly start: number; readonly end: number }
    | { readonly kind: 'move'; readonly id: string; readonly start: number }
    | { readonly kind: 'resize'; readonly id: string; readonly end: number }
    | { readonly kind: 'rename'; readonly id: string; readonly title: string }
    | { readonly kind: 'remove'; readonly id: string };

export type DayStep = 'previous' | 'next' | 'today';

type Gesture =
    | {
          readonly kind: 'create';
          readonly from: number;
          readonly to: number;
          readonly done: boolean;
      }
    | { readonly kind: 'move'; readonly id: string; readonly start: number; readonly done: boolean }
    | {
          readonly kind: 'resize';
          readonly id: string;
          readonly end: number;
          readonly done: boolean;
      };

const ENDS = ['pointerup', 'pointercancel'] as const;

const blockOf = (id: string): HTMLElement => {
    const element = document.createElement('div');
    element.className = 'block';
    element.dataset['block'] = id;

    const time = document.createElement('span');
    time.className = 'time';

    const title = document.createElement('input');
    title.className = 'title';
    title.dataset['title'] = id;
    title.placeholder = 'Untitled';
    title.autocomplete = 'off';
    title.setAttribute('aria-label', 'block title');

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.dataset['remove'] = id;
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'delete block');

    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.dataset['handle'] = id;

    element.append(time, title, remove, handle);

    return element;
};

const filled = (element: HTMLElement, block: Placed, active: Element | null): void => {
    element.style.setProperty('--start', String(block.start));
    element.style.setProperty('--length', String(block.end - block.start));
    element.style.setProperty('--lane', String(block.lane));
    element.style.setProperty('--lanes', String(block.lanes));
    element.dataset['start'] = String(block.start);
    element.dataset['end'] = String(block.end);
    element.toggleAttribute('data-short', block.end - block.start <= 30);

    const time = element.querySelector('.time');
    const title = element.querySelector('.title');

    if (time !== null) {
        time.textContent = `${timeOf(block.start)}–${timeOf(block.end)}`;
    }

    // Not while focused: that would overwrite a title being typed with another window's edit.
    if (title instanceof HTMLInputElement && title !== active) {
        title.value = block.title;
    }
};

const dataOf = (target: EventTarget | null, key: string): string | undefined => {
    const element = target instanceof Element ? target.closest(`[data-${key}]`) : null;

    return element instanceof HTMLElement ? element.dataset[key] : undefined;
};

export class HksAgenda extends HTMLElement {
    readonly changes$: Observable<AgendaChange>;
    readonly steps$: Observable<DayStep>;

    private readonly shadow: ShadowRoot;
    private readonly gestures$: Observable<Gesture>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        const hours = requireChild(shadow, '.hours');
        const blocks = requireChild(shadow, '.blocks');

        // Measured, not assumed: the canvas zoom scales the column, and the ratio already includes it.
        const minuteAt = (clientY: number): number => {
            const { top, height } = hours.getBoundingClientRect();

            return ((clientY - top) / height) * DAY_MINUTES;
        };

        // Shared: the ghost in connect$ and the changes must read one gesture, not two.
        this.gestures$ = fromElementEvent$(hours, 'pointerdown').pipe(
            filter(
                start =>
                    start.isPrimary &&
                    start.button === 0 &&
                    !(start.target instanceof HTMLInputElement) &&
                    !(start.target instanceof HTMLButtonElement),
            ),
            switchMap(start => {
                start.preventDefault();
                const same = (event: PointerEvent): boolean => event.pointerId === start.pointerId;
                const origin = minuteAt(start.clientY);
                const handle = dataOf(start.target, 'handle');
                const block =
                    start.target instanceof Element ? start.target.closest('.block') : null;
                const id = block instanceof HTMLElement ? block.dataset['block'] : undefined;
                const was = {
                    start: Number(block instanceof HTMLElement ? block.dataset['start'] : 0),
                    end: Number(block instanceof HTMLElement ? block.dataset['end'] : 0),
                };

                const at = (event: PointerEvent, done: boolean): Gesture => {
                    const moved = minuteAt(event.clientY) - origin;

                    if (handle !== undefined) {
                        return { kind: 'resize', id: handle, end: snapped(was.end + moved), done };
                    }

                    return id !== undefined
                        ? { kind: 'move', id, start: snapped(was.start + moved), done }
                        : { kind: 'create', from: origin, to: origin + moved, done };
                };

                return merge(
                    fromDocumentEvent$('pointermove').pipe(
                        filter(same),
                        startWith(start),
                        map(event => at(event, false)),
                    ),
                    ...ENDS.map(end =>
                        fromDocumentEvent$(end).pipe(
                            filter(same),
                            take(1),
                            map(event => at(event, true)),
                        ),
                    ),
                ).pipe(takeWhile(({ done }) => !done, true));
            }),
            share(),
        );

        this.changes$ = merge(
            this.gestures$.pipe(
                mergeMap((gesture): Observable<AgendaChange> => {
                    if (gesture.kind === 'move') {
                        return of({ kind: 'move', id: gesture.id, start: gesture.start });
                    }

                    if (gesture.kind === 'resize') {
                        return of({ kind: 'resize', id: gesture.id, end: gesture.end });
                    }

                    if (!gesture.done) {
                        return EMPTY;
                    }

                    const low = Math.min(gesture.from, gesture.to);
                    const high = Math.max(gesture.from, gesture.to);

                    return high - low < SNAP
                        ? of({
                              kind: 'create',
                              start: Math.floor(low / SNAP) * SNAP,
                              end: Math.floor(low / SNAP) * SNAP + NEW_LENGTH,
                          })
                        : of({ kind: 'create', start: low, end: high });
                }),
                distinctUntilChanged(
                    (a, b) =>
                        a.kind === b.kind &&
                        (a.kind === 'move' && b.kind === 'move'
                            ? a.id === b.id && a.start === b.start
                            : a.kind === 'resize' && b.kind === 'resize'
                              ? a.id === b.id && a.end === b.end
                              : false),
                ),
            ),
            fromElementEvent$(blocks, 'change').pipe(
                mergeMap(({ target }): Observable<AgendaChange> => {
                    const id = dataOf(target, 'title');

                    return target instanceof HTMLInputElement && id !== undefined
                        ? of({ kind: 'rename', id, title: target.value })
                        : EMPTY;
                }),
            ),
            fromElementEvent$(blocks, 'click').pipe(
                mergeMap(({ target }): Observable<AgendaChange> => {
                    const id = dataOf(target, 'remove');

                    return id === undefined ? EMPTY : of({ kind: 'remove', id });
                }),
            ),
        );

        this.steps$ = merge(
            fromElementEvent$(requireChild(shadow, '.prev'), 'click').pipe(
                map((): DayStep => 'previous'),
            ),
            fromElementEvent$(requireChild(shadow, '.next'), 'click').pipe(
                map((): DayStep => 'next'),
            ),
            fromElementEvent$(requireChild(shadow, '.today'), 'click').pipe(
                map((): DayStep => 'today'),
            ),
        );
    }

    connect$(view$: Observable<AgendaView>): Observable<void> {
        const shadow = this.shadow;
        const scroll = requireChild(shadow, '.scroll');
        const hours = requireChild(shadow, '.hours');
        const blocks = requireChild(shadow, '.blocks');
        const ghost = requireChild(shadow, '.ghost');
        const now = requireChild(shadow, '.now');
        const date = requireChild(shadow, '.date');

        return merge(
            view$.pipe(
                take(1),
                tap(() => {
                    scroll.scrollTop = (hours.offsetHeight / 24) * FIRST_HOUR;
                }),
            ),
            view$.pipe(
                tap(({ label, blocks: placed, now: minute }) => {
                    date.textContent = label;
                    now.hidden = minute === null;
                    now.style.setProperty('--start', String(minute ?? 0));

                    const active = shadow.activeElement;
                    const existing = new Map(
                        [...blocks.children]
                            .filter(child => child instanceof HTMLElement)
                            .map(child => [child.dataset['block'], child]),
                    );
                    const shown = placed.map(block => {
                        const element = existing.get(block.id) ?? blockOf(block.id);
                        filled(element, block, active);

                        return element;
                    });

                    // Only new or removed blocks change the children; moving a node would drop the focus of a title.
                    if (
                        shown.length !== blocks.children.length ||
                        shown.some(element => element.parentElement !== blocks)
                    ) {
                        blocks.replaceChildren(...shown);
                    }
                }),
            ),
            this.gestures$.pipe(
                tap(gesture => {
                    const creating = gesture.kind === 'create' && !gesture.done;
                    ghost.hidden = !creating;

                    if (gesture.kind === 'create') {
                        const low = snapped(Math.min(gesture.from, gesture.to));
                        const high = Math.max(
                            snapped(Math.max(gesture.from, gesture.to)),
                            low + SNAP,
                        );
                        ghost.style.setProperty('--start', String(low));
                        ghost.style.setProperty('--length', String(high - low));
                    }

                    this.toggleAttribute(
                        'data-dragging',
                        !gesture.done && gesture.kind !== 'create',
                    );
                }),
            ),
            fromElementEvent$(blocks, 'keydown').pipe(
                tap(event => {
                    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
                        event.preventDefault();
                        event.target.blur();
                    }
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-agenda', HksAgenda);
