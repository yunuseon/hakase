import { Icon } from '../../shared/ui/icon.component.ts';
import { ICONS } from '../../shared/ui/icons.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { ref } from 'lit-html/directives/ref.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { when } from 'lit-html/directives/when.js';
import { withValue } from '../../lib/lit.ts';

import { renderView, displayValue, type RenderView } from '../../lib/lit.ts';
import { HksSelect, connectSelects$ } from '../../shared/select/select.component.ts';
import { combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    share,
    shareReplay,
    startWith,
    switchMap,
    takeWhile,
    tap,
} from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import {
    dropTarget,
    factsOf,
    isPriority,
    isStage,
    isView,
    PRIORITIES,
    STAGES,
    statusOf,
    ticketsIn,
    type Drag,
    type DragPhase,
    type Facts,
    type Lane,
    type Step,
    type Ticket,
    type TicketCommand,
    type TicketView,
    type View,
} from '../../shared/tickets.ts';
import css from './tickets.css?inline';

const sheet = styleSheet(css);

const PRIORITY_LABELS: Readonly<Record<(typeof PRIORITIES)[number], string>> = {
    none: 'No priority',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent',
};

const STAGE_LABELS: Readonly<Record<(typeof STAGES)[number], string>> = {
    open: 'Open',
    active: 'Active',
    done: 'Done',
};

type TicketRender = {
    readonly screen: TicketView | null;
    readonly selected: Ticket | undefined;
    readonly all: ReadonlyMap<string, Ticket>;
    readonly facts: ReadonlyMap<string, Facts>;
    readonly mode: View;
    readonly left: string;
};

const TicketRow = (props: { readonly ticket: Ticket; readonly facts: Facts | undefined }) =>
    html`<li
        class="ticket"
        data-ticket=${ifDefined(props.ticket.id)}
        data-priority=${ifDefined(props.ticket.priority)}
        data-done=${ifDefined(props.facts?.done ? '' : undefined)}
        data-blocked=${ifDefined((props.facts?.blockers.length ?? 0) > 0 ? '' : undefined)}
    >
        <button
            type="button"
            class="grip"
            data-grip=${ifDefined(props.ticket.id)}
            aria-label=${ifDefined(`move "${props.ticket.title}"; arrow keys move it`)}
            title="drag, or focus and press the arrow keys, to move"
        ></button
        ><input
            type="checkbox"
            class="ui-check check"
            data-toggle=${ifDefined(props.ticket.id)}
            .checked=${props.facts?.done === true}
            aria-label=${ifDefined(`${props.ticket.title} done`)}
        /><button
            type="button"
            class="number"
            data-open=${ifDefined(props.ticket.id)}
            aria-label="open ticket"
        >
            #${props.ticket.number}</button
        ><textarea
            class="ui-field text"
            data-edit=${ifDefined(props.ticket.id)}
            rows="1"
            aria-label="ticket title"
            ${ref(element => {
                if (element instanceof HTMLTextAreaElement) {
                    displayValue(element, props.ticket.title);
                }
            })}
        ></textarea
        ><button
            type="button"
            class="remove"
            data-remove=${ifDefined(props.ticket.id)}
            aria-label=${ifDefined(`delete "${props.ticket.title}"`)}
        >
            ×
        </button>
        <div class="meta">
            ${repeat(
                props.ticket.tags,
                item => item,
                tag =>
                    html`<button
                        type="button"
                        class="ui-badge tag"
                        data-filter-tag=${ifDefined(tag)}
                        aria-label=${ifDefined(`filter by tag ${tag}`)}
                    >
                        ${tag}
                    </button>`,
            )}${when(props.ticket.priority !== 'none', () => html`<span class="priority">${PRIORITY_LABELS[props.ticket.priority]}</span>`)}${when(props.facts?.parent != null, () => html`<span class="parent">↳ #${props.facts?.parent}</span>`)}${when(
                (props.facts?.blockers.length ?? 0) > 0,
                () =>
                    html`<span class="blockers"
                        >blocked
                        by${' '}${props.facts?.blockers
                            .map(number => `#${number}`)
                            .join(', ')}</span
                    >`,
            )}${when((props.facts?.children.total ?? 0) > 0, () => html`<span class="children">${props.facts?.children.done}/${props.facts?.children.total} sub-tickets</span>`)}${when(props.ticket.description !== '', () => html`<span class="described">≡ notes</span>`)}
        </div>
    </li>`;

const TEMPLATE = (view: TicketRender) =>
    html`<div class="frame">
        <header class="bar">
            <div class="ui-choices views" role="radiogroup" aria-label="view">
                <label class="ui-segment view"
                    ><input
                        type="radio"
                        name="view"
                        value="list"
                        .checked=${view.mode === 'list'}
                    /><span>List</span></label
                ><label class="ui-segment view"
                    ><input
                        type="radio"
                        name="view"
                        value="board"
                        .checked=${view.mode === 'board'}
                    /><span>Board</span></label
                >
            </div>
            <div class="bar-actions">
                <button
                    class="ui-icon add-status icon-action"
                    type="button"
                    aria-label="add status"
                    title="Add a status before Done"
                >
                    ${Icon('M3 5h11v14H3zM8.5 5v14M19 9v10M14 14h10')}</button
                ><button
                    class="ui-icon new-ticket icon-action"
                    type="button"
                    data-create=""
                    aria-label="new ticket"
                    title="New ticket"
                >
                    ${Icon(ICONS.add)}
                </button>
            </div>
        </header>
        <input
            class="ui-field ticket-search"
            type="search"
            aria-label="search tickets"
            placeholder="Search tickets by title, #number, or tag"
        /><label class="tag-filter"
            >Tags${' '}<hks-select
                class="ui-field filter-tags"
                aria-label="filter by tag"
                .value=${view.screen?.filter ?? ''}
                ><option value="">All tags</option>
                ${repeat(
                    view.screen?.tags ?? [],
                    item => item,
                    tag => html`<option .value=${tag}>${tag}</option>`,
                )}</hks-select
            ></label
        >
        <div class="scroller">
            <div class="statuses">
                ${repeat(
                    view.screen?.listing.statuses.map(status => status.id) ?? [],
                    item => item,
                    id =>
                        withValue(
                            view.screen?.listing.statuses.find(status => status.id === id),
                            status =>
                                html`<section
                                    class="status"
                                    data-status=${ifDefined(id)}
                                    data-stage-of=${ifDefined(status.stage)}
                                >
                                    <header class="head">
                                        <button
                                            type="button"
                                            class="status-grip"
                                            data-status-grip=${ifDefined(id)}
                                            aria-label="move status; arrow keys move it"
                                            title="drag, or focus and press the arrow keys, to move the status"
                                        ></button
                                        ><input
                                            class="ui-field title"
                                            data-title=${ifDefined(id)}
                                            autocomplete="off"
                                            aria-label="status name"
                                            ${ref(element => {
                                                if (element instanceof HTMLInputElement) {
                                                    displayValue(element, status.title);
                                                }
                                            })}
                                        /><hks-select
                                            class="ui-field stage"
                                            data-stage=${ifDefined(id)}
                                            aria-label="what this status means"
                                            .value=${status.stage}
                                            >${STAGES.map(
                                                stage =>
                                                    html`<option .value=${stage}>
                                                        ${STAGE_LABELS[stage]}
                                                    </option>`,
                                            )}</hks-select
                                        ><span class="count">${status.tickets.length}</span
                                        ><button
                                            type="button"
                                            class="remove-status"
                                            data-remove-status=${ifDefined(id)}
                                            aria-label="delete status"
                                            title="only an empty status can be deleted"
                                            ?disabled=${
                                                view.screen?.tickets.statuses.length === 1 ||
                                                (view.screen?.tickets.statuses.find(
                                                    each => each.id === id,
                                                )?.tickets.length ?? 0) > 0
                                            }
                                        >
                                            ×
                                        </button>
                                    </header>
                                    <ul class="tickets">
                                        ${repeat(
                                            status.tickets.map(ticket => ticket.id),
                                            item => item,
                                            ticketId =>
                                                withValue(
                                                    status.tickets.find(
                                                        ticket => ticket.id === ticketId,
                                                    ),
                                                    ticket =>
                                                        TicketRow({
                                                            ticket: ticket,
                                                            facts: view.facts.get(ticketId),
                                                        }),
                                                ),
                                        )}
                                    </ul>
                                    <div class="add-here">
                                        <button
                                            type="button"
                                            class="ui-icon new-ticket icon-action"
                                            data-create=${ifDefined(id)}
                                            aria-label="new ticket with details in this status"
                                            title="New ticket in this status"
                                        >
                                            ${Icon(ICONS.add)}
                                        </button>
                                    </div>
                                </section>`,
                        ),
                )}
            </div>
        </div>
        <footer class="foot">
            <span class="left">${view.left}</span
            ><button
                ?hidden=${view.screen?.filter != null || (view.screen?.query.trim() ?? '') !== ''}
                class="ui-icon clear-done icon-action"
                type="button"
                aria-label="clear completed tickets"
                title="Clear completed tickets"
            >
                ${Icon('m4 7 3 3 6-6M15 7h5M4 14h16M4 19h11')}
            </button>
        </footer>
        <aside
            class="detail"
            aria-label="ticket"
            ?hidden=${view.selected === undefined}
            data-ticket=${ifDefined(view.selected?.id)}
        >
            <header class="detail-head">
                <span class="detail-number">#${view.selected?.number}</span
                ><button class="ui-icon close-detail" type="button" aria-label="close ticket">
                    ×
                </button>
            </header>
            <input
                class="ui-field detail-title"
                ${ref(element => {
                    if (element instanceof HTMLInputElement) {
                        displayValue(element, view.selected?.title ?? '');
                    }
                })}
                aria-label="title"
                autocomplete="off"
            />
            <div class="fields">
                <label
                    >Status${' '}<hks-select
                        class="ui-field detail-status"
                        .value=${selectedStatus(view)}
                        >${repeat(
                            view.screen?.tickets.statuses.map(status => status.id) ?? [],
                            item => item,
                            id =>
                                html`<option .value=${id}>
                                    ${
                                        view.screen?.tickets.statuses.find(
                                            status => status.id === id,
                                        )?.title
                                    }
                                </option>`,
                        )}</hks-select
                    ></label
                ><label
                    >Priority${' '}<hks-select
                        class="ui-field detail-priority"
                        .value=${view.selected?.priority ?? 'none'}
                        >${PRIORITIES.map(
                            priority =>
                                html`<option .value=${priority}>
                                    ${PRIORITY_LABELS[priority]}
                                </option>`,
                        )}</hks-select
                    ></label
                >
            </div>
            <slot name="parent"></slot>
            <section class="group">
                <h3>Tags</h3>
                <ul class="ticket-tags">
                    ${repeat(
                        view.selected?.tags ?? [],
                        item => item,
                        tag =>
                            html`<li class="ui-badge tag">
                                ${tag}<button
                                    type="button"
                                    class="ui-icon remove-tag"
                                    data-untag=${ifDefined(tag)}
                                    aria-label=${ifDefined(`remove tag ${tag}`)}
                                >
                                    ×
                                </button>
                            </li>`,
                    )}
                </ul>
                <form class="add-tag">
                    <hks-select
                        editable=""
                        class="ui-field tag-draft"
                        placeholder="Add tags, separated by commas"
                        aria-label="new tags"
                        >${repeat(
                            view.screen?.tags ?? [],
                            item => item,
                            tag => html`<option .value=${tag}>${tag}</option>`,
                        )}</hks-select
                    ><button
                        class="ui-icon submit-tag icon-action"
                        type="submit"
                        aria-label="add tags"
                        title="Add tags"
                    >
                        ${Icon(ICONS.add)}
                    </button>
                </form>
            </section>
            <section class="group">
                <h3>Blocked by</h3>
                <ul class="blocker-list">
                    ${repeat(
                        view.selected?.blockedBy ?? [],
                        item => item,
                        id =>
                            withValue(
                                view.all.get(id),
                                blocker =>
                                    html`<li
                                        data-done=${ifDefined(view.facts.get(id)?.done ? '' : undefined)}
                                    >
                                        <button
                                            type="button"
                                            class="link"
                                            data-open=${ifDefined(id)}
                                            aria-label=${ifDefined(`open ${labelOf(blocker)}`)}
                                        >
                                            ${labelOf(blocker)}</button
                                        ><button
                                            type="button"
                                            class="ui-icon unblock"
                                            data-unblock=${ifDefined(id)}
                                            aria-label=${ifDefined(`no longer blocked by #${blocker.number}`)}
                                        >
                                            ×
                                        </button>
                                    </li>`,
                            ),
                    )}
                </ul>
                <slot name="blocker"></slot>
            </section>
            <section class="group">
                <div class="group-head">
                    <h3>Sub-tickets</h3>
                    <button
                        class="ui-icon new-ticket new-child icon-action"
                        type="button"
                        data-create=""
                        aria-label="new sub-ticket"
                        title="New sub-ticket"
                    >
                        ${Icon(ICONS.add)}
                    </button>
                </div>
                <ul class="child-list">
                    ${repeat(
                        [...view.all.values()]
                            .filter(ticket => ticket.parent === view.selected?.id)
                            .map(ticket => ticket.id),
                        item => item,
                        id =>
                            withValue(
                                view.all.get(id),
                                child =>
                                    html`<li
                                        data-done=${ifDefined(view.facts.get(id)?.done ? '' : undefined)}
                                    >
                                        <button
                                            type="button"
                                            class="link"
                                            data-open=${ifDefined(id)}
                                            aria-label=${ifDefined(`open ${labelOf(child)}`)}
                                        >
                                            ${labelOf(child)}
                                        </button>
                                    </li>`,
                            ),
                    )}
                </ul>
            </section>
            <textarea
                class="ui-field detail-description"
                ${ref(element => {
                    if (element instanceof HTMLTextAreaElement) {
                        displayValue(element, view.selected?.description ?? '');
                    }
                })}
                rows="4"
                placeholder="Add a description (optional)"
                aria-label="description"
            ></textarea
            ><button
                class="ui-icon delete-ticket icon-action"
                type="button"
                aria-label="delete ticket"
                title="Delete ticket"
            >
                ${Icon(ICONS.remove)}
            </button>
        </aside>
        <slot name="creator"></slot>
    </div>`;

const ARROWS: Readonly<Record<string, Step>> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
};

const ENDS = ['pointerup', 'pointercancel'] as const;

type Submitted = {
    readonly form: HTMLFormElement;
    readonly command: TicketCommand;
};

const labelOf = ({ number, title }: Ticket): string => `#${number} ${title}`;
const selectedStatus = ({ screen, selected }: TicketRender): string =>
    screen === null || selected === undefined
        ? ''
        : (statusOf(screen.tickets, selected.id)?.id ?? '');
const renderModel = (screen: TicketView, selected: string | null, mode: View): TicketRender => {
    const all = new Map(ticketsIn(screen.tickets).map(ticket => [ticket.id, ticket]));
    const facts = [...factsOf(screen.listing).values()];
    const left = facts.filter(({ done }) => !done).length;
    return {
        screen,
        selected: all.get(selected ?? ''),
        all,
        facts: factsOf(screen.tickets),
        mode,
        left:
            facts.length === 0
                ? screen.filter === null
                    ? 'Nothing to do'
                    : 'No matching tickets'
                : `${left} open of ${facts.length}${screen.filter === null && screen.query.trim() === '' ? '' : ' matching'}`,
    };
};

const dataOf = (target: EventTarget | null, key: string): string | undefined => {
    const element = target instanceof Element ? target.closest(`[data-${dashed(key)}]`) : null;

    return element instanceof HTMLElement ? element.dataset[key] : undefined;
};

const dashed = (key: string): string => key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

const elementsIn = (parent: Element): HTMLElement[] =>
    [...parent.children].filter(child => child instanceof HTMLElement);

const middleY = (element: Element): number => {
    const { top, height } = element.getBoundingClientRect();

    return top + height / 2;
};

const middleX = (element: Element): number => {
    const { left, width } = element.getBoundingClientRect();

    return left + width / 2;
};

export class HksTickets extends HTMLElement {
    readonly commands$: Observable<TicketCommand>;
    readonly views$: Observable<View>;
    readonly filters$: Observable<string | null>;

    private readonly shadow: ShadowRoot;
    private readonly statuses: HTMLElement;
    private readonly aside: HTMLElement;
    private readonly drags$: Observable<Drag>;
    private readonly tagSubmitted$: Observable<Submitted>;
    readonly selected$: Observable<string | null>;
    readonly creations$: Observable<{
        readonly title: string;
        readonly status: string | null;
        readonly parent: string | null;
    }>;
    readonly searches$: Observable<string>;

    private readonly rendering: RenderView<TicketRender>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<TicketRender>(
            shadow,
            {
                screen: null,
                selected: undefined,
                all: new Map(),
                facts: new Map(),
                mode: 'list',
                left: 'Nothing to do',
            },
            TEMPLATE,
        );

        this.statuses = requireChild(shadow, '.statuses');
        this.aside = requireChild(shadow, '.detail');
        const aside = this.aside;
        const scroller = requireChild(shadow, '.scroller');
        const frame = requireChild(shadow, '.frame');

        this.searches$ = fromElementEvent$(requireChild(shadow, '.ticket-search'), 'input').pipe(
            mergeMap(({ target }) => (target instanceof HTMLInputElement ? [target.value] : [])),
        );
        this.creations$ = fromElementEvent$(frame, 'click').pipe(
            mergeMap(({ target }) => {
                const button = target instanceof Element ? target.closest('[data-create]') : null;
                return button instanceof HTMLElement
                    ? [
                          {
                              title: '',
                              status: button.dataset['create'] || null,
                              parent: !button.classList.contains('new-child')
                                  ? null
                                  : (aside.dataset['ticket'] ?? null),
                          },
                      ]
                    : [];
            }),
        );

        this.filters$ = merge(
            fromElementEvent$(requireChild(shadow, '.filter-tags'), 'change').pipe(
                mergeMap(({ target }) =>
                    target instanceof HksSelect ? [target.value === '' ? null : target.value] : [],
                ),
            ),
            fromElementEvent$(frame, 'click').pipe(
                mergeMap(({ target }) => {
                    const tag = dataOf(target, 'filterTag');

                    return tag === undefined ? [] : [tag];
                }),
            ),
        );

        this.views$ = fromElementEvent$(requireChild(shadow, '.views'), 'change').pipe(
            mergeMap(({ target }) =>
                target instanceof HTMLInputElement && isView(target.value) ? [target.value] : [],
            ),
        );

        this.selected$ = merge(
            fromElementEvent$(frame, 'click').pipe(
                mergeMap(({ target }) => {
                    const open = dataOf(target, 'open');

                    return open !== undefined
                        ? [open]
                        : target instanceof Element && target.closest('.close-detail') !== null
                          ? [null]
                          : [];
                }),
            ),
            fromElementEvent$(aside, 'keydown').pipe(
                filter(({ key }) => key === 'Escape'),
                map(() => null),
            ),
        ).pipe(
            startWith(null),
            distinctUntilChanged(),
            shareReplay({ bufferSize: 1, refCount: true }),
        );

        // One listener, shared: the draft is read once, before anyone clears it.
        this.tagSubmitted$ = fromElementEvent$(requireChild(aside, '.add-tag'), 'submit').pipe(
            // Not a page navigation: the form exists for Enter, not to be sent anywhere.
            tap(event => {
                event.preventDefault();
            }),
            mergeMap((event): Submitted[] => {
                const form = event.target instanceof HTMLFormElement ? event.target : null;
                const draft = form?.querySelector('hks-select');

                if (form === null || !(draft instanceof HksSelect)) {
                    return [];
                }

                const id = aside.dataset['ticket'];

                return id === undefined
                    ? []
                    : [{ form, command: { kind: 'tag', id, tags: draft.value.split(',') } }];
            }),
            share(),
        );

        const lanesExcept = (id: string): readonly Lane[] =>
            elementsIn(this.statuses).flatMap(section => {
                const status = section.dataset['status'];
                const list = section.querySelector('.tickets');

                if (status === undefined || list === null) {
                    return [];
                }

                const { left, right, top, bottom } = section.getBoundingClientRect();
                const middles = elementsIn(list)
                    .filter(item => item.dataset['ticket'] !== id)
                    .map(middleY);

                return [{ id: status, left, right, top, bottom, middles }];
            });

        const statusIndex = (id: string, x: number, y: number): number =>
            elementsIn(this.statuses)
                .filter(section => section.dataset['status'] !== id)
                .filter(section =>
                    this.dataset['view'] === 'list' ? middleY(section) < y : middleX(section) < x,
                ).length;

        // Shared: the indicator in connect$ and the move in commands$ must read one gesture, not two.
        this.drags$ = fromElementEvent$(scroller, 'pointerdown').pipe(
            mergeMap(start => {
                const ticket = dataOf(start.target, 'grip');
                const status = dataOf(start.target, 'statusGrip');

                if (!start.isPrimary || start.button !== 0) {
                    return EMPTY;
                }

                return ticket !== undefined
                    ? of({ start, kind: 'ticket' as const, id: ticket })
                    : status !== undefined
                      ? of({ start, kind: 'status' as const, id: status })
                      : EMPTY;
            }),
            // Otherwise the press starts a text selection across everything it passes.
            tap(({ start }) => {
                start.preventDefault();
            }),
            switchMap(({ start, kind, id }) => {
                const same = (event: PointerEvent): boolean => event.pointerId === start.pointerId;
                const at = (event: PointerEvent, phase: DragPhase): Drag =>
                    kind === 'ticket'
                        ? {
                              kind,
                              id,
                              target: dropTarget(event.clientX, event.clientY, lanesExcept(id)),
                              phase,
                          }
                        : { kind, id, to: statusIndex(id, event.clientX, event.clientY), phase };

                return merge(
                    fromDocumentEvent$('pointermove').pipe(
                        filter(same),
                        startWith(start),
                        map(event => at(event, 'moving')),
                    ),
                    ...ENDS.map(end =>
                        fromDocumentEvent$(end).pipe(
                            filter(same),
                            map(event => at(event, end === 'pointerup' ? 'dropped' : 'cancelled')),
                        ),
                    ),
                ).pipe(takeWhile(({ phase }) => phase === 'moving', true));
            }),
            share(),
        );

        const selectedId = (): string | undefined => aside.dataset['ticket'];

        this.commands$ = merge(
            this.tagSubmitted$.pipe(map(({ command }) => command)),
            fromElementEvent$(frame, 'change').pipe(
                mergeMap(({ target }): TicketCommand[] => {
                    const id = selectedId();

                    if (target instanceof HTMLTextAreaElement) {
                        const ticket = dataOf(target, 'edit');

                        return ticket !== undefined
                            ? [{ kind: 'rename', id: ticket, title: target.value }]
                            : target.classList.contains('detail-description') && id !== undefined
                              ? [{ kind: 'describe', id, text: target.value }]
                              : [];
                    }

                    if (target instanceof HksSelect) {
                        const stage = dataOf(target, 'stage');
                        const value = target.value;

                        if (stage !== undefined) {
                            return isStage(value)
                                ? [{ kind: 'stage', id: stage, stage: value }]
                                : [];
                        }

                        if (id === undefined) {
                            return [];
                        }

                        if (target.classList.contains('detail-status')) {
                            return [
                                { kind: 'move', id, status: value, to: Number.MAX_SAFE_INTEGER },
                            ];
                        }

                        if (target.classList.contains('detail-priority')) {
                            return isPriority(value)
                                ? [{ kind: 'prioritise', id, priority: value }]
                                : [];
                        }

                        return [];
                    }

                    if (!(target instanceof HTMLInputElement)) {
                        return [];
                    }

                    const toggled = dataOf(target, 'toggle');
                    const status = dataOf(target, 'title');

                    return toggled !== undefined
                        ? [{ kind: 'toggle', id: toggled }]
                        : status !== undefined
                          ? [{ kind: 'rename-status', id: status, title: target.value }]
                          : target.classList.contains('detail-title') && id !== undefined
                            ? [{ kind: 'rename', id, title: target.value }]
                            : [];
                }),
            ),
            fromElementEvent$(scroller, 'keydown').pipe(
                mergeMap(event => {
                    const step = ARROWS[event.key];
                    const ticket = dataOf(event.target, 'grip');
                    const status = dataOf(event.target, 'statusGrip');

                    return step === undefined
                        ? []
                        : ticket !== undefined
                          ? [{ event, step, ticket, status: undefined }]
                          : status !== undefined
                            ? [{ event, step, ticket: undefined, status }]
                            : [];
                }),
                // Handled here: the canvas would otherwise read the same arrow as a section step.
                tap(({ event }) => {
                    event.preventDefault();
                }),
                mergeMap(({ step, ticket, status }): TicketCommand[] => {
                    if (ticket !== undefined) {
                        return [{ kind: 'step', id: ticket, step }];
                    }

                    const index = elementsIn(this.statuses).findIndex(
                        section => section.dataset['status'] === status,
                    );

                    return status === undefined || index < 0
                        ? []
                        : [
                              {
                                  kind: 'move-status',
                                  id: status,
                                  to: index + (step === 'left' || step === 'up' ? -1 : 1),
                              },
                          ];
                }),
            ),
            this.drags$.pipe(
                mergeMap((drag): TicketCommand[] => {
                    if (drag.phase !== 'dropped') {
                        return [];
                    }

                    if (drag.kind === 'status') {
                        return [{ kind: 'move-status', id: drag.id, to: drag.to }];
                    }

                    return drag.target === null
                        ? []
                        : [{ kind: 'move', id: drag.id, ...drag.target }];
                }),
            ),
            fromElementEvent$(frame, 'click').pipe(
                mergeMap(({ target }): TicketCommand[] => {
                    const id = selectedId();
                    const ticket = dataOf(target, 'remove');
                    const status = dataOf(target, 'removeStatus');
                    const unblock = dataOf(target, 'unblock');
                    const tag = dataOf(target, 'untag');
                    const element = target instanceof Element ? target : null;

                    if (tag !== undefined && id !== undefined) {
                        return [{ kind: 'untag', id, tag }];
                    }

                    if (ticket !== undefined) {
                        return [{ kind: 'remove', id: ticket }];
                    }

                    if (status !== undefined) {
                        return [{ kind: 'remove-status', id: status }];
                    }

                    if (unblock !== undefined && id !== undefined) {
                        return [{ kind: 'unblock', id, by: unblock }];
                    }

                    if (
                        element?.closest('.delete-ticket') !== null &&
                        element !== null &&
                        id !== undefined
                    ) {
                        return [{ kind: 'remove', id }];
                    }

                    if (element?.closest('.add-status') !== null && element !== null) {
                        return [{ kind: 'add-status' }];
                    }

                    return element?.closest('.clear-done') !== null && element !== null
                        ? [{ kind: 'clear-done' }]
                        : [];
                }),
            ),
        );
    }

    connect$(tickets$: Observable<TicketView>, view$: Observable<View>): Observable<void> {
        const shadow = this.shadow;
        const shown$ = tickets$.pipe(shareReplay({ bufferSize: 1, refCount: true }));

        return merge(
            this.rendering.lifetime$,
            merge(
                connectSelects$(this.shadow),
                combineLatest([shown$, this.selected$, view$]).pipe(
                    map(([screen, selected, mode]) => renderModel(screen, selected, mode)),
                    tap(view => {
                        const active = shadow.activeElement;
                        const key =
                            active instanceof HTMLElement
                                ? (active.dataset['grip'] ?? active.dataset['edit'])
                                : undefined;
                        const text =
                            active instanceof HTMLTextAreaElement ? active.value : undefined;
                        this.dataset['view'] = view.mode;
                        this.rendering.update(view);
                        if (
                            key !== undefined &&
                            active instanceof HTMLElement &&
                            !active.isConnected
                        ) {
                            const replacement = shadow.querySelector(
                                `[data-${text === undefined ? 'grip' : 'edit'}="${CSS.escape(key)}"]`,
                            );
                            if (replacement instanceof HTMLTextAreaElement && text !== undefined) {
                                replacement.value = text;
                            }
                            if (replacement instanceof HTMLElement) {
                                replacement.focus();
                            }
                        }
                    }),
                ),
                this.tagSubmitted$.pipe(
                    tap(({ form }) => {
                        form.reset();
                        requireElement(form, '.tag-draft', HksSelect).value = '';
                    }),
                ),
                fromElementEvent$(this.statuses, 'keydown').pipe(
                    tap(event => {
                        const { target } = event;
                        const editing =
                            target instanceof HTMLTextAreaElement ||
                            target instanceof HTMLInputElement;

                        if (editing && event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            target.blur();
                        }
                    }),
                ),
                this.drags$.pipe(
                    tap(drag => {
                        indicated(shadow, this.statuses, drag);
                    }),
                ),
            ).pipe(map(() => undefined)),
        );
    }
}

const indicated = (shadow: ShadowRoot, statuses: HTMLElement, drag: Drag): void => {
    const marks = ['data-dragging', 'data-drop-before', 'data-drop-after', 'data-drop-into'];

    for (const element of shadow.querySelectorAll('.status, .ticket')) {
        for (const mark of marks) {
            element.removeAttribute(mark);
        }
    }

    if (drag.phase !== 'moving') {
        return;
    }

    const selector = drag.kind === 'ticket' ? 'data-ticket' : 'data-status';
    const dragged = shadow.querySelector(`[${selector}="${CSS.escape(drag.id)}"]`);
    dragged?.setAttribute('data-dragging', '');
    const grip = dragged?.querySelector(drag.kind === 'ticket' ? '.grip' : '.status-grip');

    // The press is preventDefaulted, which also cancels the focus a click would give the grip.
    if (grip instanceof HTMLElement && grip !== shadow.activeElement) {
        grip.focus();
    }

    const mark = (others: readonly HTMLElement[], to: number, empty: Element | null): void => {
        const before = others[to];

        if (before !== undefined) {
            before.setAttribute('data-drop-before', '');
        } else if (others.length > 0) {
            others.at(-1)?.setAttribute('data-drop-after', '');
        } else {
            empty?.setAttribute('data-drop-into', '');
        }
    };

    if (drag.kind === 'status') {
        mark(
            elementsIn(statuses).filter(section => section !== dragged),
            drag.to,
            null,
        );

        return;
    }

    if (drag.target === null) {
        return;
    }

    const section = shadow.querySelector(`[data-status="${CSS.escape(drag.target.status)}"]`);
    const list = section?.querySelector('.tickets');
    const others = list === null || list === undefined ? [] : elementsIn(list);
    mark(
        others.filter(item => item !== dragged),
        drag.target.to,
        section ?? null,
    );
};

customElements.define('hks-tickets', HksTickets);
