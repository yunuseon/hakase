import { EMPTY, merge, of, type Observable } from 'rxjs';
import { map, mergeMap, share, take, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import type { ClockCommand, ClockRow } from './clocks.ts';
import css from './clocks.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <ul class="rows"></ul>
    <p class="empty">No clocks yet.</p>
    <form class="add">
        <input class="draft" type="text" list="zones" placeholder="Add a city or time zone" aria-label="time zone" autocomplete="off" />
        <datalist id="zones"></datalist>
        <button class="submit" type="submit">Add</button>
    </form>
`;

const SVG = 'http://www.w3.org/2000/svg';

const dialOf = (): SVGSVGElement => {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.classList.add('dial');

    const face = document.createElementNS(SVG, 'circle');
    face.setAttribute('cx', '12');
    face.setAttribute('cy', '12');
    face.setAttribute('r', '10');
    face.classList.add('face');

    const hand = document.createElementNS(SVG, 'line');
    hand.setAttribute('x1', '12');
    hand.setAttribute('y1', '12');
    hand.setAttribute('x2', '12');
    hand.setAttribute('y2', '4.5');
    hand.classList.add('hand');

    svg.append(face, hand);

    return svg;
};

const rowOf = (zone: string): HTMLElement => {
    const row = document.createElement('li');
    row.className = 'row';
    row.dataset['zone'] = zone;

    const place = document.createElement('div');
    place.className = 'place';
    place.innerHTML = '<span class="city"></span><span class="meta"></span>';

    const time = document.createElement('div');
    time.className = 'time';
    time.innerHTML = '<span class="hm"></span><span class="s"></span>';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.dataset['remove'] = zone;
    remove.textContent = '×';
    remove.setAttribute('aria-label', `remove ${zone}`);

    row.append(dialOf(), place, time, remove);

    return row;
};

const filled = (row: HTMLElement, clock: ClockRow): void => {
    row.toggleAttribute('data-night', !clock.daylight);
    row.title = clock.zone;
    row.querySelector('.hand')?.setAttribute('transform', `rotate(${clock.turn * 360} 12 12)`);

    const set = (selector: string, text: string): void => {
        const element = row.querySelector(selector);

        if (element !== null && element.textContent !== text) {
            element.textContent = text;
        }
    };

    set('.city', clock.city);
    set('.meta', `${clock.day} · ${clock.difference}`);
    set('.hm', clock.time);
    set('.s', clock.seconds);
};

export class HksClocks extends HTMLElement {
    readonly commands$: Observable<ClockCommand>;

    private readonly shadow: ShadowRoot;
    private readonly submitted$: Observable<string>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        const form = requireElement(shadow, '.add', HTMLFormElement);
        const draft = requireElement(shadow, '.draft', HTMLInputElement);

        // One listener, shared: the draft is read once, before anyone clears it.
        this.submitted$ = fromElementEvent$(form, 'submit').pipe(
            map(event => {
                // Not a page navigation: the form exists for Enter, not to be sent anywhere.
                event.preventDefault();

                return draft.value;
            }),
            share(),
        );

        this.commands$ = merge(
            this.submitted$.pipe(map((zone): ClockCommand => ({ kind: 'add', zone }))),
            fromElementEvent$(requireChild(shadow, '.rows'), 'click').pipe(
                mergeMap(({ target }): Observable<ClockCommand> => {
                    const button =
                        target instanceof Element ? target.closest('[data-remove]') : null;
                    const zone =
                        button instanceof HTMLElement ? button.dataset['remove'] : undefined;

                    return zone === undefined ? EMPTY : of({ kind: 'remove', zone });
                }),
            ),
        );
    }

    connect$(rows$: Observable<readonly ClockRow[]>, choices: readonly string[]): Observable<void> {
        const shadow = this.shadow;
        const list = requireChild(shadow, '.rows');
        const options = requireChild(shadow, '#zones');
        const form = requireElement(shadow, '.add', HTMLFormElement);

        return merge(
            rows$.pipe(
                take(1),
                tap(() => {
                    options.replaceChildren(
                        ...choices.map(zone => new Option(zone.replaceAll('_', ' '), zone)),
                    );
                }),
            ),
            rows$.pipe(
                tap(rows => {
                    this.toggleAttribute('data-empty', rows.length === 0);

                    const existing = new Map(
                        [...list.children]
                            .filter(child => child instanceof HTMLElement)
                            .map(child => [child.dataset['zone'], child]),
                    );
                    const shown = rows.map(clock => {
                        const row = existing.get(clock.zone) ?? rowOf(clock.zone);
                        filled(row, clock);

                        return row;
                    });

                    if (
                        shown.length !== list.children.length ||
                        shown.some((row, index) => list.children[index] !== row)
                    ) {
                        list.replaceChildren(...shown);
                    }
                }),
            ),
            this.submitted$.pipe(
                tap(() => {
                    form.reset();
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-clocks', HksClocks);
