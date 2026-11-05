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
    tagsOf,
    type Drag,
    type DragPhase,
    type Facts,
    type Lane,
    type Status,
    type Step,
    type Ticket,
    type TicketCommand,
    type Tickets,
    type TicketView,
    type View,
} from '../../shared/tickets.ts';
import css from './tickets.css?inline';

const sheet = styleSheet(css);

const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const TRASH =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>';

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

const TEMPLATE = `
    <div class="frame">
    <header class="bar">
        <div class="views" role="radiogroup" aria-label="view">
            <label class="view"><input type="radio" name="view" value="list" /> List</label>
            <label class="view"><input type="radio" name="view" value="board" /> Board</label>
        </div>
        <div class="bar-actions"><button class="add-status icon-action" type="button" aria-label="add status" title="Add a status before Done"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h11v14H3zM8.5 5v14M19 9v10M14 14h10"/></svg></button>
        <button class="new-ticket icon-action" type="button" data-create="" aria-label="new ticket" title="New ticket">${PLUS}</button></div>
    </header>
    <input class="ticket-search" type="search" aria-label="search tickets" placeholder="Search tickets by title, #number, or tag" />
    <label class="tag-filter">Tags <hks-select class="filter-tags" aria-label="filter by tag"><option value="">All tags</option></hks-select></label>
    <div class="scroller"><div class="statuses"></div></div>
    <footer class="foot">
        <span class="left"></span>
        <button class="clear-done icon-action" type="button" aria-label="clear completed tickets" title="Clear completed tickets"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 3 3 6-6M15 7h5M4 14h16M4 19h11"/></svg></button>
    </footer>
    <aside class="detail" aria-label="ticket" hidden>
        <header class="detail-head">
            <span class="detail-number"></span>
            <button class="close-detail" type="button" aria-label="close ticket">×</button>
        </header>
        <input class="detail-title" aria-label="title" autocomplete="off" />
        <div class="fields">
            <label>Status <hks-select class="detail-status"></hks-select></label>
            <label>Priority <hks-select class="detail-priority">${PRIORITIES.map(
                priority => `<option value="${priority}">${PRIORITY_LABELS[priority]}</option>`,
            ).join('')}</hks-select></label>
        </div>
        <slot name="parent"></slot>
        <section class="group">
            <h3>Tags</h3>
            <ul class="ticket-tags"></ul>
            <form class="add-tag">
                <hks-select editable class="tag-draft" placeholder="Add tags, separated by commas" aria-label="new tags"></hks-select>
                <button class="submit-tag icon-action" type="submit" aria-label="add tags" title="Add tags">${PLUS}</button>
            </form>
            
        </section>
        <section class="group">
            <h3>Blocked by</h3>
            <ul class="blocker-list"></ul>
            <slot name="blocker"></slot>
        </section>
        <section class="group">
            <div class="group-head"><h3>Sub-tickets</h3><button class="new-ticket new-child icon-action" type="button" data-create="" aria-label="new sub-ticket" title="New sub-ticket">${PLUS}</button></div>
            <ul class="child-list"></ul>
        </section>
        <textarea class="detail-description" rows="4" placeholder="Add a description (optional)" aria-label="description"></textarea>
        <button class="delete-ticket icon-action" type="button" aria-label="delete ticket" title="Delete ticket">${TRASH}</button>
    </aside>
    <slot name="creator"></slot>
    </div>
`;

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

const button = (className: string, key: string, id: string, label: string): HTMLButtonElement => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.dataset[key] = id;
    element.setAttribute('aria-label', label);

    return element;
};

const span = (className: string, text: string): HTMLSpanElement => {
    const element = document.createElement('span');
    element.className = className;
    element.textContent = text;

    return element;
};

const ticketOf = (id: string): HTMLElement => {
    const item = document.createElement('li');
    item.className = 'ticket';
    item.dataset['ticket'] = id;

    const grip = button('grip', 'grip', id, 'move ticket');
    grip.title = 'drag, or focus and press the arrow keys, to move';

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'check';
    check.dataset['toggle'] = id;

    const number = button('number', 'open', id, 'open ticket');

    const edit = document.createElement('textarea');
    edit.className = 'text';
    edit.dataset['edit'] = id;
    edit.rows = 1;
    edit.setAttribute('aria-label', 'ticket title');

    const meta = document.createElement('div');
    meta.className = 'meta';

    const remove = button('remove', 'remove', id, 'delete ticket');
    remove.textContent = '×';

    item.append(grip, check, number, edit, remove, meta);

    return item;
};

const fillTicket = (
    item: HTMLElement,
    ticket: Ticket,
    facts: Facts | undefined,
    active: Element | null,
): void => {
    const edit = item.querySelector('.text');
    const check = item.querySelector('.check');
    const number = item.querySelector('.number');

    // Not while focused: that would overwrite what is being typed with another window's edit.
    if (edit instanceof HTMLTextAreaElement && edit !== active) {
        edit.value = ticket.title;
    }

    if (check instanceof HTMLInputElement) {
        check.checked = facts?.done === true;
        check.setAttribute('aria-label', `${ticket.title} done`);
    }

    if (number !== null) {
        number.textContent = `#${ticket.number}`;
    }

    item.dataset['priority'] = ticket.priority;
    item.toggleAttribute('data-done', facts?.done === true);
    item.toggleAttribute('data-blocked', (facts?.blockers.length ?? 0) > 0);
    item.querySelector('.grip')?.setAttribute(
        'aria-label',
        `move "${ticket.title}"; arrow keys move it`,
    );
    item.querySelector('.remove')?.setAttribute('aria-label', `delete "${ticket.title}"`);
    item.querySelector('.meta')?.replaceChildren(
        ...ticket.tags.map(tag => {
            const chip = button('tag', 'filterTag', tag, `filter by tag ${tag}`);
            chip.textContent = tag;

            return chip;
        }),
        ...(ticket.priority === 'none' ? [] : [span('priority', PRIORITY_LABELS[ticket.priority])]),
        ...(facts?.parent === null || facts === undefined
            ? []
            : [span('parent', `↳ #${facts.parent}`)]),
        ...(facts === undefined || facts.blockers.length === 0
            ? []
            : [
                  span(
                      'blockers',
                      `blocked by ${facts.blockers.map(each => `#${each}`).join(', ')}`,
                  ),
              ]),
        ...(facts === undefined || facts.children.total === 0
            ? []
            : [span('children', `${facts.children.done}/${facts.children.total} sub-tickets`)]),
        ...(ticket.description === '' ? [] : [span('described', '≡ notes')]),
    );
};

const sectionOf = (id: string): HTMLElement => {
    const section = document.createElement('section');
    section.className = 'status';
    section.dataset['status'] = id;

    const head = document.createElement('header');
    head.className = 'head';

    const grip = button('status-grip', 'statusGrip', id, 'move status; arrow keys move it');
    grip.title = 'drag, or focus and press the arrow keys, to move the status';

    const title = document.createElement('input');
    title.className = 'title';
    title.dataset['title'] = id;
    title.autocomplete = 'off';
    title.setAttribute('aria-label', 'status name');

    const stage = new HksSelect();
    stage.className = 'stage';
    stage.dataset['stage'] = id;
    stage.setAttribute('aria-label', 'what this status means');
    stage.append(
        ...STAGES.map(each => {
            const option = document.createElement('option');
            option.value = each;
            option.textContent = STAGE_LABELS[each];

            return option;
        }),
    );

    const count = document.createElement('span');
    count.className = 'count';

    const remove = button('remove-status', 'removeStatus', id, 'delete status');
    remove.textContent = '×';
    remove.title = 'only an empty status can be deleted';

    head.append(grip, title, stage, count, remove);

    const tickets = document.createElement('ul');
    tickets.className = 'tickets';

    const add = document.createElement('div');
    add.className = 'add-here';
    const create = button(
        'new-ticket icon-action',
        'create',
        id,
        'new ticket with details in this status',
    );
    create.title = 'New ticket in this status';
    create.innerHTML = PLUS;
    add.append(create);

    section.append(head, tickets, add);

    return section;
};

const fillStatus = (
    section: HTMLElement,
    status: Status,
    items: readonly HTMLElement[],
    active: Element | null,
    last: boolean,
): void => {
    const title = section.querySelector('.title');
    const stage = section.querySelector('.stage');
    const count = section.querySelector('.count');
    const remove = section.querySelector('.remove-status');
    const list = section.querySelector('.tickets');

    if (title instanceof HTMLInputElement && title !== active) {
        title.value = status.title;
    }

    if (stage instanceof HksSelect && stage !== active) {
        stage.value = status.stage;
    }

    section.dataset['stageOf'] = status.stage;

    if (count !== null) {
        count.textContent = String(status.tickets.length);
    }

    if (remove instanceof HTMLButtonElement) {
        remove.disabled = last || status.tickets.length > 0;
    }

    if (list !== null) {
        ordered(list, items);
    }
};

// Only when the order differs: moving a node drops its focus, and a click that lands on it.
const ordered = (parent: Element, children: readonly HTMLElement[]): void => {
    const current = elementsIn(parent);

    if (
        current.length !== children.length ||
        children.some((child, index) => current[index] !== child)
    ) {
        parent.replaceChildren(...children);
    }
};

const rendered = (
    shadow: ShadowRoot,
    statuses: HTMLElement,
    { listing, tickets }: TicketView,
): void => {
    const active = shadow.activeElement;
    const facts = factsOf(tickets);
    const sections = new Map(
        elementsIn(statuses).map(section => [section.dataset['status'], section]),
    );
    const items = new Map(
        [...statuses.querySelectorAll('.ticket')]
            .filter(item => item instanceof HTMLElement)
            .map(item => [item.dataset['ticket'], item]),
    );

    ordered(
        statuses,
        listing.statuses.map(status => {
            const section = sections.get(status.id) ?? sectionOf(status.id);
            const inside = status.tickets.map(ticket => {
                const item = items.get(ticket.id) ?? ticketOf(ticket.id);
                fillTicket(item, ticket, facts.get(ticket.id), active);

                return item;
            });
            fillStatus(section, status, inside, active, tickets.statuses.length === 1);
            const remove = section.querySelector('.remove-status');
            if (remove instanceof HTMLButtonElement) {
                remove.disabled =
                    tickets.statuses.length === 1 ||
                    (tickets.statuses.find(each => each.id === status.id)?.tickets.length ?? 0) > 0;
            }

            return section;
        }),
    );

    // A ticket moved to another status was re-inserted, which drops its focus.
    if (active instanceof HTMLElement && active.isConnected && active !== shadow.activeElement) {
        active.focus();
    }
};

const option = (value: string, text: string): HTMLOptionElement => {
    const element = document.createElement('option');
    element.value = value;
    element.textContent = text;

    return element;
};

// Rebuilt only when the choices change, or an open dropdown would close under the pointer.
const offered = (select: HksSelect, options: readonly HTMLOptionElement[]): void => {
    const key = options
        .map(({ value, textContent }) => `${value}\u0000${textContent}`)
        .join('\u0001');

    if (select.dataset['offered'] !== key) {
        select.dataset['offered'] = key;
        select.replaceChildren(...options);
    }
};

const labelOf = ({ number, title }: Ticket): string => `#${number} ${title}`;

const detailed = (
    shadow: ShadowRoot,
    aside: HTMLElement,
    tickets: Tickets,
    selected: string | null,
): void => {
    const ticket = ticketsIn(tickets).find(({ id }) => id === selected);
    const active = shadow.activeElement;
    aside.hidden = ticket === undefined;

    if (ticket === undefined) {
        delete aside.dataset['ticket'];

        return;
    }

    aside.dataset['ticket'] = ticket.id;
    requireChild(aside, '.ticket-tags').replaceChildren(
        ...ticket.tags.map(tag => {
            const item = document.createElement('li');
            item.className = 'tag';
            const remove = button('remove-tag', 'untag', tag, `remove tag ${tag}`);
            remove.textContent = '×';
            item.append(document.createTextNode(tag), remove);

            return item;
        }),
    );
    requireChild(aside, '.tag-draft').replaceChildren(
        ...tagsOf(tickets).map(tag => option(tag, tag)),
    );
    requireChild(aside, '.detail-number').textContent = `#${ticket.number}`;

    const title = requireElement(aside, '.detail-title', HTMLInputElement);
    const status = requireElement(aside, '.detail-status', HksSelect);
    const priority = requireElement(aside, '.detail-priority', HksSelect);
    const description = requireElement(aside, '.detail-description', HTMLTextAreaElement);

    if (title !== active) {
        title.value = ticket.title;
    }

    offered(
        status,
        tickets.statuses.map(each => option(each.id, each.title)),
    );
    status.value = statusOf(tickets, ticket.id)?.id ?? '';
    priority.value = ticket.priority;

    if (description !== active) {
        description.value = ticket.description;
    }

    const all = ticketsIn(tickets);
    const facts = factsOf(tickets);

    requireChild(aside, '.blocker-list').replaceChildren(
        ...ticket.blockedBy.flatMap(id => {
            const blocker = all.find(each => each.id === id);

            if (blocker === undefined) {
                return [];
            }

            const item = document.createElement('li');
            item.toggleAttribute('data-done', facts.get(id)?.done === true);
            const open = button('link', 'open', id, `open ${labelOf(blocker)}`);
            open.textContent = labelOf(blocker);
            const remove = button(
                'unblock',
                'unblock',
                id,
                `no longer blocked by #${blocker.number}`,
            );
            remove.textContent = '×';
            item.append(open, remove);

            return [item];
        }),
    );
    requireChild(aside, '.child-list').replaceChildren(
        ...all
            .filter(each => each.parent === ticket.id)
            .map(child => {
                const item = document.createElement('li');
                item.toggleAttribute('data-done', facts.get(child.id)?.done === true);
                const open = button('link', 'open', child.id, `open ${labelOf(child)}`);
                open.textContent = labelOf(child);
                item.append(open);

                return item;
            }),
    );
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

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

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
            connectSelects$(this.shadow),
            shown$.pipe(
                tap(screen => {
                    rendered(shadow, this.statuses, screen);
                    const filter = requireElement(shadow, '.filter-tags', HksSelect);
                    offered(filter, [
                        option('', 'All tags'),
                        ...screen.tags.map(tag => option(tag, tag)),
                    ]);
                    filter.value = screen.filter ?? '';
                    requireChild(shadow, '.clear-done').hidden =
                        screen.filter !== null || screen.query.trim() !== '';

                    const facts = [...factsOf(screen.listing).values()];
                    const left = facts.filter(({ done }) => !done).length;
                    requireChild(shadow, '.left').textContent =
                        facts.length === 0
                            ? screen.filter === null
                                ? 'Nothing to do'
                                : 'No matching tickets'
                            : `${left} open of ${facts.length}${screen.filter === null && screen.query.trim() === '' ? '' : ' matching'}`;
                }),
            ),
            combineLatest([shown$, this.selected$]).pipe(
                tap(([screen, selected]) => {
                    detailed(shadow, this.aside, screen.tickets, selected);
                }),
            ),
            view$.pipe(
                tap(view => {
                    this.dataset['view'] = view;

                    for (const radio of shadow.querySelectorAll('input[name="view"]')) {
                        if (radio instanceof HTMLInputElement) {
                            radio.checked = radio.value === view;
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
                        target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;

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
        ).pipe(map(() => undefined));
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
