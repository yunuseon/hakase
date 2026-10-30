import { EMPTY, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    pairwise,
    startWith,
    switchMap,
    takeUntil,
    tap,
} from 'rxjs/operators';
import { styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import { sameSections, type SectionGesture, type SectionView } from './sections.ts';
import css from './sections.css?inline';

const sheet = styleSheet(css);

const dataOf = (target: EventTarget | null, key: string): string | undefined => {
    const element = target instanceof Element ? target.closest(`[data-${key}]`) : null;

    return element instanceof HTMLElement ? element.dataset[key] : undefined;
};

const sectionOf = (id: string): HTMLElement => {
    // A fieldset and its legend, so the border opens a real gap for the name with nothing painted behind it.
    const section = document.createElement('fieldset');
    section.className = 'section';
    section.dataset['section'] = id;

    const label = document.createElement('legend');
    label.className = 'label';
    label.dataset['move'] = id;

    const name = document.createElement('input');
    name.className = 'name';
    name.readOnly = true;
    name.spellcheck = false;
    name.dataset['rename'] = id;
    name.setAttribute('aria-label', 'section name, double-click to rename');

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.dataset['remove'] = id;
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'delete section');

    const corner = document.createElement('div');
    corner.className = 'corner';
    corner.dataset['resize'] = id;

    label.append(name, remove);
    section.append(label, corner);

    return section;
};

export class HksSections extends HTMLElement {
    readonly gestures$: Observable<SectionGesture>;

    private readonly layer: HTMLElement;

    constructor() {
        super();

        const root = this.attachShadow({ mode: 'open' });
        root.adoptedStyleSheets = [sheet];
        this.layer = document.createElement('div');
        this.layer.className = 'layer';
        root.append(this.layer);

        const drags$ = (kind: 'move' | 'resize'): Observable<SectionGesture> =>
            fromElementEvent$(this, 'pointerdown').pipe(
                mergeMap(start => {
                    const target = start.composedPath()[0] ?? null;
                    const id = dataOf(target, kind);
                    // A name being edited takes its own pointer, to place the caret.
                    const editing = target instanceof HTMLInputElement && !target.readOnly;

                    return id === undefined || editing || !start.isPrimary || start.button !== 0
                        ? EMPTY
                        : of({ start, id });
                }),
                switchMap(({ start, id }) => {
                    start.preventDefault();
                    const same = (event: PointerEvent): boolean =>
                        event.pointerId === start.pointerId;

                    // Ends on the document: released anywhere, the drag must still finish.
                    const end$ = merge(
                        fromDocumentEvent$('pointerup'),
                        fromDocumentEvent$('pointercancel'),
                    ).pipe(filter(same));

                    return fromDocumentEvent$('pointermove').pipe(
                        filter(same),
                        takeUntil(end$),
                        startWith(start),
                        pairwise(),
                        map(([from, to]): SectionGesture => ({
                            kind,
                            id,
                            dx: to.clientX - from.clientX,
                            dy: to.clientY - from.clientY,
                        })),
                    );
                }),
            );

        const pathTarget = (event: Event): EventTarget | null => event.composedPath()[0] ?? null;

        this.gestures$ = merge(
            drags$('move'),
            drags$('resize'),
            fromElementEvent$(this, 'click').pipe(
                mergeMap((event): Observable<SectionGesture> => {
                    const id = dataOf(pathTarget(event), 'remove');

                    return id === undefined ? EMPTY : of({ kind: 'remove', id });
                }),
            ),
            // On the layer, not the host: change is not composed, so it never leaves the shadow root.
            fromElementEvent$(this.layer, 'change').pipe(
                mergeMap((event): Observable<SectionGesture> => {
                    const target = pathTarget(event);
                    const id = dataOf(target, 'rename');

                    return id === undefined || !(target instanceof HTMLInputElement)
                        ? EMPTY
                        : of({ kind: 'rename', id, name: target.value });
                }),
            ),
        );
    }

    connect$(sections$: Observable<readonly SectionView[]>): Observable<void> {
        const editing$ = merge(
            fromElementEvent$(this, 'dblclick').pipe(
                map(event => event.composedPath()[0] ?? null),
                tap(target => {
                    if (
                        target instanceof HTMLInputElement &&
                        dataOf(target, 'rename') !== undefined
                    ) {
                        target.readOnly = false;
                        target.select();
                    }
                }),
            ),
            fromElementEvent$(this, 'keydown').pipe(
                tap(event => {
                    const target = event.composedPath()[0] ?? null;

                    if (target instanceof HTMLInputElement && event.key === 'Enter') {
                        target.blur();
                    }
                }),
            ),
            fromElementEvent$(this, 'focusout').pipe(
                tap(event => {
                    const target = event.composedPath()[0] ?? null;

                    if (target instanceof HTMLInputElement) {
                        target.readOnly = true;
                    }
                }),
            ),
        );

        const drawn$ = sections$.pipe(
            distinctUntilChanged(sameSections),
            tap(sections => {
                const existing = new Map(
                    [...this.layer.querySelectorAll('.section')].flatMap(element =>
                        element instanceof HTMLElement && element.dataset['section'] !== undefined
                            ? [[element.dataset['section'], element] as const]
                            : [],
                    ),
                );

                const wanted = new Set(sections.map(({ id }) => id));

                for (const [id, element] of existing) {
                    if (!wanted.has(id)) {
                        element.remove();
                    }
                }

                // In place, never re-inserted: moving a node would drop the focus of a name being typed.
                for (const { id, name, x, y, width, height } of sections) {
                    const element = existing.get(id) ?? this.layer.appendChild(sectionOf(id));
                    element.style.left = `${x}px`;
                    element.style.top = `${y}px`;
                    element.style.width = `${width}px`;
                    element.style.height = `${height}px`;

                    const input = element.querySelector('.name');
                    if (
                        input instanceof HTMLInputElement &&
                        input.readOnly &&
                        input.value !== name
                    ) {
                        input.value = name;
                    }
                }
            }),
        );

        return merge(drawn$, editing$).pipe(map(() => undefined));
    }
}

customElements.define('hks-sections', HksSections);
