import type { Logged } from './logged.ts';

export const STAGES = ['open', 'active', 'done'] as const;
export type Stage = (typeof STAGES)[number];

export const isStage = (value: string): value is Stage => STAGES.some(stage => stage === value);

export const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const isPriority = (value: string): value is Priority =>
    PRIORITIES.some(priority => priority === value);

export const STEPS = ['up', 'down', 'left', 'right'] as const;
export type Step = (typeof STEPS)[number];

export const VIEWS = ['list', 'board'] as const;
export type View = (typeof VIEWS)[number];

export const isView = (value: string): value is View => VIEWS.some(view => view === value);

export type Ticket = {
    readonly id: string;
    readonly number: number;
    readonly title: string;
    readonly description: string;
    readonly priority: Priority;
    readonly tags: readonly string[];
    readonly parent: string | null;
    readonly blockedBy: readonly string[];
};

export type Status = {
    readonly id: string;
    readonly title: string;
    readonly stage: Stage;
    readonly tickets: readonly Ticket[];
};

export type Tickets = {
    readonly statuses: readonly Status[];
    // Monotone, so neither an id nor a number is ever handed out twice.
    readonly made: number;
    readonly numbered: number;
};

export type TicketCommand =
    | {
          readonly kind: 'add';
          readonly status: string | null;
          readonly title: string;
          readonly parent: string | null;
          readonly tags?: readonly string[];
          readonly description?: string;
          readonly priority?: Priority;
          readonly blockedBy?: readonly string[];
      }
    | { readonly kind: 'rename'; readonly id: string; readonly title: string }
    | { readonly kind: 'describe'; readonly id: string; readonly text: string }
    | { readonly kind: 'prioritise'; readonly id: string; readonly priority: Priority }
    | { readonly kind: 'tag'; readonly id: string; readonly tags: readonly string[] }
    | { readonly kind: 'untag'; readonly id: string; readonly tag: string }
    | { readonly kind: 'toggle'; readonly id: string }
    | { readonly kind: 'remove'; readonly id: string }
    | { readonly kind: 'step'; readonly id: string; readonly step: Step }
    // `to` counts places in the target status without the moved ticket, which is what a drop indicates.
    | { readonly kind: 'move'; readonly id: string; readonly status: string; readonly to: number }
    | { readonly kind: 'nest'; readonly id: string; readonly parent: string | null }
    | { readonly kind: 'block'; readonly id: string; readonly by: string }
    | { readonly kind: 'unblock'; readonly id: string; readonly by: string }
    | { readonly kind: 'clear-done' }
    | { readonly kind: 'add-status' }
    | { readonly kind: 'rename-status'; readonly id: string; readonly title: string }
    | { readonly kind: 'stage'; readonly id: string; readonly stage: Stage }
    | { readonly kind: 'remove-status'; readonly id: string }
    | { readonly kind: 'move-status'; readonly id: string; readonly to: number };

export const UNTITLED = 'Untitled';

export const defaultTickets: Tickets = {
    statuses: [
        { id: 'status-1', title: 'To do', stage: 'open', tickets: [] },
        { id: 'status-2', title: 'In progress', stage: 'active', tickets: [] },
        { id: 'status-3', title: 'Done', stage: 'done', tickets: [] },
    ],
    made: 3,
    numbered: 0,
};

export const ticketsIn = ({ statuses }: Tickets): readonly Ticket[] =>
    statuses.flatMap(({ tickets }) => tickets);

export const normaliseTags = (tags: readonly string[]): readonly string[] =>
    [
        ...new Set(
            tags
                .flatMap(tag => tag.split(','))
                .map(tag => tag.trim().replace(/\s+/g, ' ').toLowerCase())
                .filter(tag => tag !== ''),
        ),
    ].sort();

const tagsFrom = (value: unknown): readonly string[] =>
    Array.isArray(value)
        ? normaliseTags(value.filter((tag: unknown): tag is string => typeof tag === 'string'))
        : [];

export const tagsOf = (tickets: Tickets): readonly string[] =>
    normaliseTags(ticketsIn(tickets).flatMap(ticket => ticket.tags));

export type TicketView = {
    readonly tickets: Tickets;
    readonly listing: Tickets;
    readonly tags: readonly string[];
    readonly filter: string | null;
    readonly query: string;
};

export const matchesTicket = (ticket: Ticket, query: string): boolean =>
    query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .every(word =>
            `${ticket.title} #${ticket.number} ${ticket.description} ${ticket.tags.join(' ')}`
                .toLowerCase()
                .includes(word),
        );

export const ticketView = (tickets: Tickets, filter: string | null, query = ''): TicketView => ({
    tickets,
    listing:
        filter === null && query.trim() === ''
            ? tickets
            : {
                  ...tickets,
                  statuses: tickets.statuses.map(status => ({
                      ...status,
                      tickets: status.tickets.filter(
                          ticket =>
                              (filter === null || ticket.tags.includes(filter)) &&
                              matchesTicket(ticket, query),
                      ),
                  })),
              },
    tags: normaliseTags([...tagsOf(tickets), ...(filter === null ? [] : [filter])]),
    filter,
    query,
});

export const commandInView = (view: TicketView, command: TicketCommand): TicketCommand | null => {
    if (view.filter === null && view.query.trim() === '') {
        return command;
    }

    if (command.kind === 'add' && view.filter !== null) {
        return { ...command, tags: normaliseTags([...(command.tags ?? []), view.filter]) };
    }

    const move =
        command.kind === 'step' ? stepped(view.listing, command.id, command.step) : command;

    if (move === null || move.kind !== 'move') {
        return move;
    }

    const visible =
        view.listing.statuses
            .find(status => status.id === move.status)
            ?.tickets.filter(ticket => ticket.id !== move.id) ?? [];
    const all =
        view.tickets.statuses
            .find(status => status.id === move.status)
            ?.tickets.filter(ticket => ticket.id !== move.id) ?? [];
    const at = Math.max(0, Math.min(Math.round(move.to), visible.length));
    const place = placeOf(view.listing, move.id);

    if (
        place !== null &&
        view.listing.statuses[place.status]?.id === move.status &&
        place.index === at
    ) {
        return null;
    }

    const before = visible[at];
    const after = visible.at(-1);
    const to =
        before !== undefined
            ? all.findIndex(ticket => ticket.id === before.id)
            : after !== undefined
              ? all.findIndex(ticket => ticket.id === after.id) + 1
              : all.length;

    return { ...move, to };
};

const ticketOf = (tickets: Tickets, id: string): Ticket | undefined =>
    ticketsIn(tickets).find(ticket => ticket.id === id);

export const statusOf = (tickets: Tickets, id: string): Status | undefined =>
    tickets.statuses.find(status => status.tickets.some(ticket => ticket.id === id));

export const isDone = (tickets: Tickets, id: string): boolean =>
    statusOf(tickets, id)?.stage === 'done';

const inserted = <T>(items: readonly T[], item: T, to: number): readonly T[] => {
    const at = Math.min(Math.max(Math.round(to), 0), items.length);

    return [...items.slice(0, at), item, ...items.slice(at)];
};

const sameTicket = (a: Ticket, b: Ticket): boolean =>
    a.id === b.id &&
    a.number === b.number &&
    a.title === b.title &&
    a.description === b.description &&
    a.priority === b.priority &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, index) => b.tags[index] === tag) &&
    a.parent === b.parent &&
    a.blockedBy.length === b.blockedBy.length &&
    a.blockedBy.every((id, index) => b.blockedBy[index] === id);

const changed = (tickets: Tickets, id: string, change: (ticket: Ticket) => Ticket): Tickets => {
    const before = ticketOf(tickets, id);
    const after = before === undefined ? undefined : change(before);

    return before === undefined || after === undefined || sameTicket(before, after)
        ? tickets
        : {
              ...tickets,
              statuses: tickets.statuses.map(status =>
                  status.tickets.includes(before)
                      ? {
                            ...status,
                            tickets: status.tickets.map(ticket =>
                                ticket === before ? after : ticket,
                            ),
                        }
                      : status,
              ),
          };
};

const reaches = (
    tickets: Tickets,
    from: string,
    to: string,
    next: (ticket: Ticket) => readonly string[],
): boolean => {
    const all = new Map(ticketsIn(tickets).map(ticket => [ticket.id, ticket]));
    // `seen`, or a parent cycle read from storage would recurse forever.
    const walk = (frontier: readonly string[], seen: ReadonlySet<string>): boolean =>
        frontier.length === 0
            ? false
            : frontier.includes(to) ||
              walk(
                  frontier
                      .flatMap(id => {
                          const ticket = all.get(id);

                          return ticket === undefined ? [] : next(ticket);
                      })
                      .filter(id => !seen.has(id)),
                  new Set([...seen, ...frontier]),
              );

    return walk([from], new Set());
};

const parentsOf = ({ parent }: Ticket): readonly string[] => (parent === null ? [] : [parent]);

const blockersOf = ({ blockedBy }: Ticket): readonly string[] => blockedBy;

const without = (tickets: Tickets, gone: ReadonlySet<string>): Tickets => {
    const parents = new Map(ticketsIn(tickets).map(ticket => [ticket.id, ticket.parent]));
    const surviving = (parent: string | null): string | null =>
        parent !== null && gone.has(parent) ? surviving(parents.get(parent) ?? null) : parent;

    return {
        ...tickets,
        statuses: tickets.statuses.map(status => ({
            ...status,
            tickets: status.tickets
                .filter(ticket => !gone.has(ticket.id))
                .map(ticket => ({
                    ...ticket,
                    parent: surviving(ticket.parent),
                    blockedBy: ticket.blockedBy.filter(id => !gone.has(id)),
                })),
        })),
    };
};

const moved = (tickets: Tickets, id: string, status: string, to: number): Tickets => {
    const ticket = ticketOf(tickets, id);

    return ticket === undefined || !tickets.statuses.some(({ id: each }) => each === status)
        ? tickets
        : {
              ...tickets,
              statuses: tickets.statuses.map(each => {
                  const rest = each.tickets.filter(other => other.id !== id);

                  return {
                      ...each,
                      tickets: each.id === status ? inserted(rest, ticket, to) : rest,
                  };
              }),
          };
};

const stepTickets = (tickets: Tickets, command: TicketCommand, logged?: Logged): Tickets => {
    switch (command.kind) {
        case 'add': {
            const title = command.title.trim();
            const status =
                tickets.statuses.find(({ id }) => id === command.status) ??
                tickets.statuses.find(({ stage }) => stage === 'open') ??
                tickets.statuses[0];
            const parent =
                command.parent !== null && ticketOf(tickets, command.parent) !== undefined
                    ? command.parent
                    : null;
            const made = tickets.made + 1;
            const number = tickets.numbered + 1;

            return title === '' || status === undefined
                ? tickets
                : {
                      made,
                      numbered: number,
                      statuses: tickets.statuses.map(each =>
                          each.id === status.id
                              ? {
                                    ...each,
                                    tickets: [
                                        ...each.tickets,
                                        {
                                            id: `ticket-${logged?.seq ?? made}`,
                                            number,
                                            title,
                                            description:
                                                command.description?.trim() === ''
                                                    ? ''
                                                    : (command.description ?? ''),
                                            priority: command.priority ?? 'none',
                                            tags: normaliseTags(command.tags ?? []),
                                            parent,
                                            blockedBy: [...new Set(command.blockedBy ?? [])].filter(
                                                id => ticketOf(tickets, id) !== undefined,
                                            ),
                                        },
                                    ],
                                }
                              : each,
                      ),
                  };
        }
        case 'rename': {
            const title = command.title.trim();

            return title === ''
                ? tickets
                : changed(tickets, command.id, ticket => ({ ...ticket, title }));
        }
        case 'describe':
            return changed(tickets, command.id, ticket => ({
                ...ticket,
                description: command.text.trim() === '' ? '' : command.text,
            }));
        case 'prioritise':
            return changed(tickets, command.id, ticket => ({
                ...ticket,
                priority: command.priority,
            }));
        case 'tag':
            return changed(tickets, command.id, ticket => ({
                ...ticket,
                tags: normaliseTags([...ticket.tags, ...command.tags]),
            }));
        case 'untag':
            return changed(tickets, command.id, ticket => ({
                ...ticket,
                tags: ticket.tags.filter(tag => !normaliseTags([command.tag]).includes(tag)),
            }));
        case 'toggle': {
            const done = isDone(tickets, command.id);
            const target = done
                ? (tickets.statuses.find(({ stage }) => stage === 'open') ??
                  tickets.statuses.find(({ stage }) => stage !== 'done'))
                : tickets.statuses.find(({ stage }) => stage === 'done');

            return target === undefined
                ? tickets
                : moved(tickets, command.id, target.id, target.tickets.length);
        }
        case 'remove':
            return ticketOf(tickets, command.id) === undefined
                ? tickets
                : without(tickets, new Set([command.id]));
        case 'step': {
            const move = stepped(tickets, command.id, command.step);

            return move === null ? tickets : reduceTickets(tickets, move, logged);
        }
        case 'move':
            return moved(tickets, command.id, command.status, command.to);
        case 'nest': {
            const { id, parent } = command;
            const refused =
                parent !== null &&
                (parent === id ||
                    ticketOf(tickets, parent) === undefined ||
                    reaches(tickets, parent, id, parentsOf));

            return refused || ticketOf(tickets, id)?.parent === parent
                ? tickets
                : changed(tickets, id, ticket => ({ ...ticket, parent }));
        }
        case 'block': {
            const { id, by } = command;
            const ticket = ticketOf(tickets, id);
            const refused =
                ticket === undefined ||
                by === id ||
                ticketOf(tickets, by) === undefined ||
                ticket.blockedBy.includes(by) ||
                reaches(tickets, by, id, blockersOf);

            return refused
                ? tickets
                : changed(tickets, id, each => ({ ...each, blockedBy: [...each.blockedBy, by] }));
        }
        case 'unblock':
            return changed(tickets, command.id, ticket => ({
                ...ticket,
                blockedBy: ticket.blockedBy.filter(id => id !== command.by),
            }));
        case 'clear-done': {
            const done = tickets.statuses
                .filter(({ stage }) => stage === 'done')
                .flatMap(status => status.tickets.map(({ id }) => id));

            return done.length === 0 ? tickets : without(tickets, new Set(done));
        }
        case 'add-status': {
            const made = tickets.made + 1;
            const at = tickets.statuses.findIndex(({ stage }) => stage === 'done');

            return {
                ...tickets,
                made,
                statuses: inserted(
                    tickets.statuses,
                    {
                        id: `status-${logged?.seq ?? made}`,
                        title: UNTITLED,
                        stage: 'active',
                        tickets: [],
                    },
                    at < 0 ? tickets.statuses.length : at,
                ),
            };
        }
        case 'rename-status': {
            const title = command.title.trim();

            return {
                ...tickets,
                statuses: tickets.statuses.map(status =>
                    status.id === command.id
                        ? { ...status, title: title === '' ? UNTITLED : title }
                        : status,
                ),
            };
        }
        case 'stage':
            return {
                ...tickets,
                statuses: tickets.statuses.map(status =>
                    status.id === command.id ? { ...status, stage: command.stage } : status,
                ),
            };
        case 'remove-status':
            return tickets.statuses.length <= 1
                ? tickets
                : {
                      ...tickets,
                      statuses: tickets.statuses.filter(
                          ({ id, tickets: inside }) => id !== command.id || inside.length > 0,
                      ),
                  };
        case 'move-status': {
            const status = tickets.statuses.find(({ id }) => id === command.id);

            return status === undefined
                ? tickets
                : {
                      ...tickets,
                      statuses: inserted(
                          tickets.statuses.filter(({ id }) => id !== command.id),
                          status,
                          command.to,
                      ),
                  };
        }
    }
};

export const reduceTickets = (
    tickets: Tickets,
    command: TicketCommand,
    logged?: Logged,
): Tickets => {
    const after = stepTickets(tickets, command, logged);

    return sameTickets(tickets, after) ? tickets : after;
};

export type Where = {
    readonly status: number;
    readonly index: number;
};

export const placeOf = (tickets: Tickets, id: string): Where | null => {
    const status = tickets.statuses.findIndex(each =>
        each.tickets.some(ticket => ticket.id === id),
    );
    const index = tickets.statuses[status]?.tickets.findIndex(ticket => ticket.id === id) ?? -1;

    return status < 0 || index < 0 ? null : { status, index };
};

export const stepped = (tickets: Tickets, id: string, step: Step): TicketCommand | null => {
    const place = placeOf(tickets, id);

    if (place === null) {
        return null;
    }

    const across = step === 'left' ? -1 : step === 'right' ? 1 : 0;
    const target = tickets.statuses[place.status + across];

    if (target === undefined) {
        return null;
    }

    const to =
        across === 0
            ? place.index + (step === 'up' ? -1 : 1)
            : Math.min(place.index, target.tickets.length);

    return to < 0 || (across === 0 && to >= target.tickets.length)
        ? null
        : { kind: 'move', id, status: target.id, to };
};

export type Lane = {
    readonly id: string;
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
    readonly middles: readonly number[];
};

export type Target = {
    readonly status: string;
    readonly to: number;
};

const outside = (at: number, low: number, high: number): number =>
    at < low ? low - at : at > high ? at - high : 0;

// Nearest in both directions, so one rule serves statuses side by side (board) and stacked (list).
export const dropTarget = (x: number, y: number, lanes: readonly Lane[]): Target | null => {
    const distance = (lane: Lane) =>
        Math.hypot(outside(x, lane.left, lane.right), outside(y, lane.top, lane.bottom));
    const lane = lanes.reduce<Lane | null>(
        (best, candidate) =>
            best === null || distance(candidate) < distance(best) ? candidate : best,
        null,
    );

    return lane === null
        ? null
        : { status: lane.id, to: lane.middles.filter(middle => middle < y).length };
};

export type Drag =
    | {
          readonly kind: 'ticket';
          readonly id: string;
          readonly target: Target | null;
          readonly phase: DragPhase;
      }
    | {
          readonly kind: 'status';
          readonly id: string;
          readonly to: number;
          readonly phase: DragPhase;
      };

export type DragPhase = 'moving' | 'dropped' | 'cancelled';

export type Facts = {
    readonly done: boolean;
    readonly blockers: readonly number[];
    readonly parent: number | null;
    readonly children: { readonly done: number; readonly total: number };
};

export const factsOf = (tickets: Tickets): ReadonlyMap<string, Facts> => {
    const all = ticketsIn(tickets);
    const done = new Set(
        tickets.statuses
            .filter(({ stage }) => stage === 'done')
            .flatMap(status => status.tickets.map(({ id }) => id)),
    );
    const numbers = new Map(all.map(({ id, number }) => [id, number]));

    return new Map(
        all.map(ticket => {
            const children = all.filter(({ parent }) => parent === ticket.id);

            return [
                ticket.id,
                {
                    done: done.has(ticket.id),
                    blockers: ticket.blockedBy
                        .filter(id => !done.has(id))
                        .flatMap(id => numbers.get(id) ?? []),
                    parent: ticket.parent === null ? null : (numbers.get(ticket.parent) ?? null),
                    children: {
                        done: children.filter(({ id }) => done.has(id)).length,
                        total: children.length,
                    },
                },
            ];
        }),
    );
};

export const parentChoices = (tickets: Tickets, id: string): readonly Ticket[] =>
    ticketsIn(tickets).filter(
        ticket => ticket.id !== id && !reaches(tickets, ticket.id, id, parentsOf),
    );

export const blockerChoices = (tickets: Tickets, id: string): readonly Ticket[] => {
    const blockedBy = ticketOf(tickets, id)?.blockedBy ?? [];

    return ticketsIn(tickets).filter(
        ticket =>
            ticket.id !== id &&
            !blockedBy.includes(ticket.id) &&
            !reaches(tickets, ticket.id, id, blockersOf),
    );
};

export const sameTickets = (a: Tickets, b: Tickets): boolean =>
    a.made === b.made &&
    a.numbered === b.numbered &&
    a.statuses.length === b.statuses.length &&
    a.statuses.every((status, index) => {
        const other = b.statuses[index];

        return (
            other !== undefined &&
            status.id === other.id &&
            status.title === other.title &&
            status.stage === other.stage &&
            status.tickets.length === other.tickets.length &&
            status.tickets.every((ticket, at) => {
                const twin = other.tickets[at];

                return twin !== undefined && sameTicket(ticket, twin);
            })
        );
    });

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

const text = (value: object, key: string): string | null => {
    const found = field(value, key);

    return typeof found === 'string' ? found : null;
};

const numberOf = (id: string): number => Number(/-(\d+)$/.exec(id)?.[1] ?? 0);

const settled = (statuses: readonly Status[], made: number, numbered: number): Tickets => {
    const uniqueStatuses = [...new Map(statuses.map(status => [status.id, status])).values()];
    const unique = uniqueStatuses.reduce<{
        readonly statuses: readonly Status[];
        readonly ids: ReadonlySet<string>;
    }>(
        (kept, status) => {
            const inside = status.tickets.filter(
                (ticket, index, all) =>
                    !kept.ids.has(ticket.id) &&
                    all.findIndex(each => each.id === ticket.id) === index,
            );
            return {
                statuses: [...kept.statuses, { ...status, tickets: inside }],
                ids: new Set([...kept.ids, ...inside.map(({ id }) => id)]),
            };
        },
        { statuses: [], ids: new Set() },
    );
    const present = unique.statuses.length === 0 ? defaultTickets.statuses : unique.statuses;
    const all = present.flatMap(({ tickets }) => tickets);
    const ids = new Set(all.map(({ id }) => id));
    const seen = new Set<number>();
    const highest = Math.max(0, ...all.map(({ number }) => number));
    const renumbered = all.reduce<ReadonlyMap<string, number>>((numbers, ticket) => {
        const clash = seen.has(ticket.number) || ticket.number < 1;
        const number = clash ? highest + numbers.size + 1 : ticket.number;
        seen.add(number);

        return clash ? new Map(numbers).set(ticket.id, number) : numbers;
    }, new Map());
    const cleaned: Tickets = {
        made: Math.max(made, ...[...ids].map(numberOf), ...present.map(({ id }) => numberOf(id))),
        numbered: Math.max(numbered, highest + renumbered.size),
        statuses: present.map(status => ({
            ...status,
            tickets: status.tickets.map(ticket => ({
                ...ticket,
                number: renumbered.get(ticket.id) ?? ticket.number,
                parent: ticket.parent !== null && ids.has(ticket.parent) ? ticket.parent : null,
                blockedBy: [...new Set(ticket.blockedBy)].filter(
                    id => id !== ticket.id && ids.has(id),
                ),
            })),
        })),
    };

    // A parent cycle from storage is cut where it closes, or every walk up the tree would be wrong.
    return ticketsIn(cleaned).reduce(
        (all, ticket) =>
            ticket.parent !== null && reaches(all, ticket.parent, ticket.id, parentsOf)
                ? changed(all, ticket.id, each => ({ ...each, parent: null }))
                : ticket.blockedBy.some(id => reaches(all, id, ticket.id, blockersOf))
                  ? changed(all, ticket.id, each => ({
                        ...each,
                        blockedBy: each.blockedBy.filter(
                            id => !reaches(all, id, each.id, blockersOf),
                        ),
                    }))
                  : all,
        cleaned,
    );
};

const ticketFrom = (value: unknown): Ticket | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const id = text(value, 'id');
    const title = text(value, 'title');
    const number = field(value, 'number');
    const priority = text(value, 'priority');
    const parent = text(value, 'parent');
    const blockedBy = field(value, 'blockedBy');

    return id === null || title === null
        ? null
        : {
              id,
              number: typeof number === 'number' && Number.isInteger(number) ? number : 0,
              title,
              description: text(value, 'description') ?? '',
              priority: priority !== null && isPriority(priority) ? priority : 'none',
              tags: tagsFrom(field(value, 'tags')),
              parent,
              blockedBy: Array.isArray(blockedBy)
                  ? blockedBy.filter(each => typeof each === 'string')
                  : [],
          };
};

const statusFrom = (value: unknown): Status | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const id = text(value, 'id');
    const title = text(value, 'title');
    const stage = text(value, 'stage');
    const tickets = field(value, 'tickets');

    return id === null || title === null || !Array.isArray(tickets)
        ? null
        : {
              id,
              title,
              stage: stage !== null && isStage(stage) ? stage : 'active',
              tickets: tickets.map(ticketFrom).filter(ticket => ticket !== null),
          };
};

const fromTodoList = (items: readonly unknown[], made: number): Tickets => {
    const todos = items.flatMap(item => {
        if (typeof item !== 'object' || item === null) {
            return [];
        }

        const id = text(item, 'id');
        const title = text(item, 'text');
        const done = field(item, 'done');

        return id === null || title === null ? [] : [{ id, title, done: done === true }];
    });
    const ticket = (
        { id, title }: { readonly id: string; readonly title: string },
        index: number,
    ) => ({
        id,
        number: index + 1,
        title,
        description: '',
        priority: 'none' as const,
        tags: [],
        parent: null,
        blockedBy: [],
    });
    const numbered = todos.map((todo, index) => ({ ...todo, ticket: ticket(todo, index) }));

    return settled(
        defaultTickets.statuses.map(status => ({
            ...status,
            tickets: numbered
                .filter(({ done }) =>
                    status.stage === 'done' ? done : !done && status.stage === 'open',
                )
                .map(({ ticket }) => ticket),
        })),
        Math.max(made, defaultTickets.made),
        todos.length,
    );
};

const DONE = /\b(done|complete|completed|finished|closed|shipped)\b/i;

const fromBoard = (columns: readonly unknown[], made: number): Tickets => {
    const read = columns.flatMap(column => {
        if (typeof column !== 'object' || column === null) {
            return [];
        }

        const id = text(column, 'id');
        const title = text(column, 'title');
        const cards = field(column, 'cards');

        return id === null || title === null || !Array.isArray(cards)
            ? []
            : [
                  {
                      id,
                      title,
                      cards: cards.flatMap((card: unknown) => {
                          if (typeof card !== 'object' || card === null) {
                              return [];
                          }

                          const cardId = text(card, 'id');
                          const cardText = text(card, 'text');

                          return cardId === null || cardText === null
                              ? []
                              : [{ id: cardId, title: cardText }];
                      }),
                  },
              ];
    });
    const named = read.some(({ title }) => DONE.test(title));
    const stageOf = (title: string, index: number): Stage =>
        (named ? DONE.test(title) : index === read.length - 1 && read.length > 1)
            ? 'done'
            : index === 0
              ? 'open'
              : 'active';
    const statuses = read.reduce<{ readonly statuses: readonly Status[]; readonly count: number }>(
        ({ statuses: done, count }, column, index) => ({
            statuses: [
                ...done,
                {
                    id: column.id,
                    title: column.title,
                    stage: stageOf(column.title, index),
                    tickets: column.cards.map((card, at) => ({
                        id: card.id,
                        number: count + at + 1,
                        title: card.title,
                        description: '',
                        priority: 'none',
                        tags: [],
                        parent: null,
                        blockedBy: [],
                    })),
                },
            ],
            count: count + column.cards.length,
        }),
        { statuses: [], count: 0 },
    );

    return settled(statuses.statuses, made, statuses.count);
};

export const parseTickets = (value: unknown): Tickets => {
    if (typeof value !== 'object' || value === null) {
        return defaultTickets;
    }

    const made = field(value, 'made');
    const counted = typeof made === 'number' && Number.isInteger(made) ? Math.max(made, 0) : 0;
    const statuses = field(value, 'statuses');
    const items = field(value, 'items');
    const columns = field(value, 'columns');

    if (Array.isArray(statuses)) {
        const numbered = field(value, 'numbered');

        return settled(
            statuses.map(statusFrom).filter(status => status !== null),
            counted,
            typeof numbered === 'number' && Number.isInteger(numbered) ? numbered : 0,
        );
    }

    return Array.isArray(items)
        ? fromTodoList(items, counted)
        : Array.isArray(columns)
          ? fromBoard(columns, counted)
          : defaultTickets;
};
