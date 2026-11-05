import { describe, expect, it } from 'vitest';
import {
    blockerChoices,
    commandInView,
    normaliseTags,
    sameTickets,
    tagsOf,
    ticketView,
    defaultTickets,
    dropTarget,
    factsOf,
    parentChoices,
    parseTickets,
    reduceTickets,
    ticketsIn,
    type TicketCommand,
    type Tickets,
} from './tickets.ts';

const run = (...commands: readonly TicketCommand[]): Tickets =>
    commands.reduce(
        (tickets, command, index) => reduceTickets(tickets, command, { seq: 10 + index }),
        defaultTickets,
    );

const add = (title: string, status: string | null = null, parent: string | null = null) =>
    ({ kind: 'add', status, title, parent }) as const;

const titles = (tickets: Tickets) =>
    tickets.statuses.map(({ title, tickets: inside }) => [title, inside.map(each => each.title)]);

describe('tickets', () => {
    it('are added to the first open status, numbered in order, ids from the log', () => {
        const tickets = run(add('Write'), add('Ship', 'status-2'), add('  '));

        expect(titles(tickets)).toEqual([
            ['To do', ['Write']],
            ['In progress', ['Ship']],
            ['Done', []],
        ]);
        expect(ticketsIn(tickets).map(({ id, number }) => [id, number])).toEqual([
            ['ticket-10', 1],
            ['ticket-11', 2],
        ]);
    });

    it('toggle between done and the first open status', () => {
        const done = run(add('Write'), { kind: 'toggle', id: 'ticket-10' });

        expect(titles(done)[2]).toEqual(['Done', ['Write']]);
        expect(titles(reduceTickets(done, { kind: 'toggle', id: 'ticket-10' }))[0]).toEqual([
            'To do',
            ['Write'],
        ]);
    });

    it('move within and across statuses, and step with the arrow keys', () => {
        const tickets = run(add('a'), add('b'), add('c'), {
            kind: 'move',
            id: 'ticket-10',
            status: 'status-1',
            to: 2,
        });

        expect(titles(tickets)[0]).toEqual(['To do', ['b', 'c', 'a']]);
        expect(
            titles(reduceTickets(tickets, { kind: 'step', id: 'ticket-11', step: 'right' }))[1],
        ).toEqual(['In progress', ['b']]);
        expect(reduceTickets(tickets, { kind: 'step', id: 'ticket-11', step: 'up' })).toBe(tickets);
    });

    it('keep a description only when it says something, and a priority', () => {
        const tickets = run(
            add('a'),
            { kind: 'describe', id: 'ticket-10', text: 'Why it matters' },
            { kind: 'prioritise', id: 'ticket-10', priority: 'urgent' },
        );

        expect(ticketsIn(tickets)[0]).toMatchObject({
            description: 'Why it matters',
            priority: 'urgent',
        });
        expect(
            ticketsIn(reduceTickets(tickets, { kind: 'describe', id: 'ticket-10', text: '  ' }))[0]
                ?.description,
        ).toBe('');
    });
});

describe('sub-tickets', () => {
    const tree = () =>
        run(add('parent'), add('child', null, 'ticket-10'), add('grandchild', null, 'ticket-11'));

    it('hang under a parent, and never under themselves or what hangs below them', () => {
        const tickets = tree();

        expect(ticketsIn(tickets).map(({ parent }) => parent)).toEqual([
            null,
            'ticket-10',
            'ticket-11',
        ]);
        expect(reduceTickets(tickets, { kind: 'nest', id: 'ticket-10', parent: 'ticket-12' })).toBe(
            tickets,
        );
        expect(reduceTickets(tickets, { kind: 'nest', id: 'ticket-10', parent: 'ticket-10' })).toBe(
            tickets,
        );
        expect(parentChoices(tickets, 'ticket-10')).toEqual([]);
    });

    it('move up to their grandparent when their parent is deleted', () => {
        const tickets = reduceTickets(tree(), { kind: 'remove', id: 'ticket-11' });

        expect(ticketsIn(tickets).map(({ id, parent }) => [id, parent])).toEqual([
            ['ticket-10', null],
            ['ticket-12', 'ticket-10'],
        ]);
    });
});

describe('blockers', () => {
    const chain = () =>
        run(
            add('a'),
            add('b'),
            add('c'),
            { kind: 'block', id: 'ticket-11', by: 'ticket-10' },
            {
                kind: 'block',
                id: 'ticket-12',
                by: 'ticket-11',
            },
        );

    it('are refused when they would close a loop, name the ticket itself, or repeat', () => {
        const tickets = chain();

        expect(reduceTickets(tickets, { kind: 'block', id: 'ticket-10', by: 'ticket-12' })).toBe(
            tickets,
        );
        expect(reduceTickets(tickets, { kind: 'block', id: 'ticket-10', by: 'ticket-10' })).toBe(
            tickets,
        );
        expect(reduceTickets(tickets, { kind: 'block', id: 'ticket-11', by: 'ticket-10' })).toBe(
            tickets,
        );
        expect(blockerChoices(tickets, 'ticket-10').map(({ id }) => id)).toEqual([]);
    });

    it('stop counting once done, and go when their ticket is deleted', () => {
        const tickets = chain();
        const facts = factsOf(reduceTickets(tickets, { kind: 'toggle', id: 'ticket-10' }));

        expect(factsOf(tickets).get('ticket-11')?.blockers).toEqual([1]);
        expect(facts.get('ticket-11')?.blockers).toEqual([]);
        expect(
            ticketsIn(reduceTickets(tickets, { kind: 'remove', id: 'ticket-11' })).map(
                ({ blockedBy }) => blockedBy,
            ),
        ).toEqual([[], []]);
    });
});

describe('statuses', () => {
    it('are added before Done, renamed, staged, moved, and deleted only while empty', () => {
        const tickets = run(
            { kind: 'add-status' },
            { kind: 'rename-status', id: 'status-10', title: 'Review' },
            add('Write', 'status-10'),
            { kind: 'remove-status', id: 'status-10' },
            { kind: 'remove-status', id: 'status-2' },
            { kind: 'stage', id: 'status-10', stage: 'done' },
            { kind: 'move-status', id: 'status-3', to: 0 },
        );

        expect(tickets.statuses.map(({ title, stage }) => [title, stage])).toEqual([
            ['Done', 'done'],
            ['To do', 'open'],
            ['Review', 'done'],
        ]);
    });

    it('clear what is done, keeping the rest', () => {
        const tickets = run(
            add('a'),
            add('b'),
            { kind: 'toggle', id: 'ticket-10' },
            {
                kind: 'clear-done',
            },
        );

        expect(ticketsIn(tickets).map(({ title }) => title)).toEqual(['b']);
    });
});

describe('dropTarget', () => {
    const lane = (id: string, left: number, top: number, middles: readonly number[]) => ({
        id,
        left,
        right: left + 100,
        top,
        bottom: top + 100,
        middles,
    });

    it('finds the status nearest the pointer whether they sit side by side or stacked', () => {
        const side = [lane('a', 0, 0, [20, 60]), lane('b', 120, 0, [20])];
        const stacked = [lane('a', 0, 0, [20, 60]), lane('b', 0, 120, [140])];

        expect(dropTarget(150, 50, side)).toEqual({ status: 'b', to: 1 });
        expect(dropTarget(50, 150, stacked)).toEqual({ status: 'b', to: 1 });
        expect(dropTarget(50, 30, stacked)).toEqual({ status: 'a', to: 1 });
        expect(dropTarget(0, 0, [])).toBeNull();
    });
});

describe('parseTickets', () => {
    it('reads a to-do list from before tickets, done items into Done', () => {
        const tickets = parseTickets({
            items: [
                { id: 'todo-4', text: 'first', done: false },
                { id: 'todo-5', text: 'second', done: true },
            ],
            made: 5,
        });

        expect(titles(tickets)).toEqual([
            ['To do', ['first']],
            ['In progress', []],
            ['Done', ['second']],
        ]);
        expect(ticketsIn(tickets).map(({ id, number }) => [id, number])).toEqual([
            ['todo-4', 1],
            ['todo-5', 2],
        ]);
        expect(tickets.numbered).toBe(2);
        expect(tickets.made).toBeGreaterThanOrEqual(5);
    });

    it('reads a board from before tickets, its columns as statuses', () => {
        const board = (titlesOf: readonly string[]) =>
            parseTickets({
                columns: titlesOf.map((title, index) => ({
                    id: `column-${index + 1}`,
                    title,
                    cards: [{ id: `card-${index + 9}`, text: `card ${index}` }],
                })),
                made: 12,
            });

        expect(board(['Ideas', 'Shipped', 'Later']).statuses.map(({ stage }) => stage)).toEqual([
            'open',
            'done',
            'active',
        ]);
        expect(board(['A', 'B', 'C']).statuses.map(({ stage }) => stage)).toEqual([
            'open',
            'active',
            'done',
        ]);
        expect(ticketsIn(board(['A', 'B'])).map(({ number }) => number)).toEqual([1, 2]);
    });

    it('settles what storage gets wrong: clashing numbers, missing references, cycles', () => {
        const ticket = (
            id: string,
            number: number,
            parent: string | null,
            blockedBy: string[],
        ) => ({
            id,
            number,
            title: id,
            parent,
            blockedBy,
        });
        const tickets = parseTickets({
            statuses: [
                {
                    id: 'status-1',
                    title: 'To do',
                    stage: 'nonsense',
                    tickets: [
                        ticket('ticket-1', 1, 'ticket-2', ['ticket-9', 'ticket-1']),
                        ticket('ticket-2', 1, 'ticket-1', []),
                    ],
                },
            ],
            made: 2,
            numbered: 2,
        });
        const [first, second] = ticketsIn(tickets);

        expect(tickets.statuses[0]?.stage).toBe('active');
        expect(first?.blockedBy).toEqual([]);
        expect(new Set([first?.number, second?.number]).size).toBe(2);
        expect([first?.parent, second?.parent].filter(parent => parent !== null)).toHaveLength(1);
        expect(parseTickets(null)).toBe(defaultTickets);
    });
});

describe('ticket invariants', () => {
    it('retains one usable status, even after an empty legacy board', () => {
        const tickets = parseTickets({ columns: [], made: 0 });
        expect(tickets.statuses.length).toBeGreaterThan(0);
        const last = { ...defaultTickets, statuses: defaultTickets.statuses.slice(0, 1) };
        expect(reduceTickets(last, { kind: 'remove-status', id: 'status-1' })).toBe(last);
        expect(ticketsIn(reduceTickets(tickets, add('Work')))).toHaveLength(1);
    });

    it('keeps numbers monotone after deletion, and refuses empty or unchanged edits', () => {
        const tickets = run(add('a'), { kind: 'remove', id: 'ticket-10' }, add('b'));
        expect(ticketsIn(tickets)[0]?.number).toBe(2);
        expect(reduceTickets(tickets, { kind: 'rename', id: 'missing', title: 'x' })).toBe(tickets);
        expect(reduceTickets(tickets, { kind: 'remove-status', id: 'status-1' })).toBe(tickets);
        expect(reduceTickets(tickets, { kind: 'rename', id: 'ticket-12', title: 'b' })).toBe(
            tickets,
        );
    });

    it('repairs duplicate ids and blocker cycles from untrusted storage', () => {
        const ticket = (id: string, by: string) => ({ id, number: 1, title: id, blockedBy: [by] });
        const tickets = parseTickets({
            statuses: [
                {
                    id: 'a',
                    title: 'Open',
                    stage: 'open',
                    tickets: [ticket('a', 'b'), ticket('b', 'a')],
                },
                { id: 'b', title: 'Done', stage: 'done', tickets: [ticket('a', 'b')] },
            ],
        });
        expect(ticketsIn(tickets).map(({ id }) => id)).toEqual(['a', 'b']);
        expect(ticketsIn(tickets).filter(({ blockedBy }) => blockedBy.length > 0)).toHaveLength(1);
        expect(new Set(ticketsIn(tickets).map(({ number }) => number)).size).toBe(2);
    });
});

describe('tags', () => {
    it('normalises names, removes duplicates and empty tags, and keeps a stable order', () => {
        expect(normaliseTags([' Work ', 'work', 'BUG, UI', '', ' needs   review ', 'ui'])).toEqual([
            'bug',
            'needs review',
            'ui',
            'work',
        ]);
        const tickets = run(
            add('a'),
            { kind: 'tag', id: 'ticket-10', tags: ['Work', 'bug'] },
            { kind: 'tag', id: 'ticket-10', tags: ['work', 'personal'] },
        );
        expect(ticketsIn(tickets)[0]?.tags).toEqual(['bug', 'personal', 'work']);
        expect(reduceTickets(tickets, { kind: 'tag', id: 'ticket-10', tags: ['WORK', ''] })).toBe(
            tickets,
        );
        expect(reduceTickets(tickets, { kind: 'untag', id: 'ticket-10', tag: 'missing' })).toBe(
            tickets,
        );
        const removed = reduceTickets(tickets, { kind: 'untag', id: 'ticket-10', tag: ' Work ' });
        expect(ticketsIn(removed)[0]?.tags).toEqual(['bug', 'personal']);
        expect(sameTickets(tickets, removed)).toBe(false);
    });

    it('reads tags from storage, defaults old tickets to no tags, and round-trips them', () => {
        const older = parseTickets({
            items: [{ id: 'todo-1', text: 'Old', done: false }],
            made: 1,
        });
        expect(ticketsIn(older)[0]?.tags).toEqual([]);
        const stored = parseTickets({
            statuses: [
                {
                    id: 's',
                    title: 'Open',
                    tickets: [
                        { id: 'a', title: 'a', tags: ['BUG', false, null, ' bug ', 'ui'] },
                        { id: 'b', title: 'b', tags: 'work' },
                    ],
                },
            ],
        });
        expect(ticketsIn(stored).map(ticket => ticket.tags)).toEqual([['bug', 'ui'], []]);
        expect(parseTickets(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    });

    it('filters every status while leaving the full document available for details', () => {
        const tickets = run(
            add('a'),
            add('b', 'status-2'),
            { kind: 'tag', id: 'ticket-10', tags: ['work'] },
            { kind: 'tag', id: 'ticket-11', tags: ['personal', 'work'] },
        );
        const view = ticketView(tickets, 'personal');
        expect(view.tickets).toBe(tickets);
        expect(ticketsIn(view.listing).map(ticket => ticket.title)).toEqual(['b']);
        expect(view.listing.statuses).toHaveLength(tickets.statuses.length);
        expect(tagsOf(tickets)).toEqual(['personal', 'work']);
        expect(ticketView(tickets, null).listing).toBe(tickets);
        expect(ticketView(tickets, 'removed').tags).toContain('removed');
        expect(ticketsIn(ticketView(tickets, 'removed').listing)).toEqual([]);
        const command = commandInView(view, add('c'));
        expect(command).toMatchObject({ kind: 'add', tags: ['personal'] });
        expect(
            command === null
                ? []
                : ticketsIn(reduceTickets(tickets, command)).find(ticket => ticket.title === 'c')
                      ?.tags,
        ).toEqual(['personal']);
    });

    it('reorders only against visible neighbours and preserves hidden tickets', () => {
        const tickets = run(
            add('hidden first'),
            add('a'),
            add('hidden middle'),
            add('b'),
            add('hidden last'),
            { kind: 'tag', id: 'ticket-11', tags: ['work'] },
            { kind: 'tag', id: 'ticket-13', tags: ['work'] },
        );
        const view = ticketView(tickets, 'work');
        expect(
            commandInView(view, { kind: 'move', id: 'ticket-13', status: 'status-1', to: 1 }),
        ).toBeNull();
        const move = commandInView(view, {
            kind: 'move',
            id: 'ticket-13',
            status: 'status-1',
            to: 0,
        });
        expect(move).toEqual({ kind: 'move', id: 'ticket-13', status: 'status-1', to: 1 });
        expect(
            move === null
                ? []
                : ticketsIn(reduceTickets(tickets, move)).map(ticket => ticket.title),
        ).toEqual(['hidden first', 'b', 'a', 'hidden middle', 'hidden last']);
        expect(commandInView(view, { kind: 'step', id: 'ticket-11', step: 'up' })).toBeNull();
        expect(commandInView(view, { kind: 'step', id: 'ticket-11', step: 'down' })).toEqual({
            kind: 'move',
            id: 'ticket-11',
            status: 'status-1',
            to: 3,
        });
        expect(
            commandInView(view, { kind: 'move', id: 'ticket-11', status: 'status-2', to: 0 }),
        ).toEqual({ kind: 'move', id: 'ticket-11', status: 'status-2', to: 0 });
    });
});

describe('ticket creation and search', () => {
    it('creates complete tickets in one reduction and removes stale relationships', () => {
        const base = run(add('parent'));
        const tickets = reduceTickets(
            base,
            {
                kind: 'add',
                title: '  Complete  ',
                description: 'Requirements',
                status: 'status-2',
                priority: 'urgent',
                tags: ['WORK'],
                parent: 'ticket-10',
                blockedBy: ['ticket-10', 'gone', 'ticket-10'],
            },
            { seq: 20 },
        );
        expect(ticketsIn(tickets).find(ticket => ticket.id === 'ticket-20')).toMatchObject({
            number: 2,
            title: 'Complete',
            description: 'Requirements',
            priority: 'urgent',
            tags: ['work'],
            parent: 'ticket-10',
            blockedBy: ['ticket-10'],
        });
    });
    it('searches keys, title, description and tags together with tag filtering', () => {
        const tickets = run(
            add('Checkout'),
            add('Docs'),
            { kind: 'describe', id: 'ticket-10', text: 'Payment flow' },
            { kind: 'tag', id: 'ticket-10', tags: ['bug'] },
        );
        expect(
            ticketsIn(ticketView(tickets, null, '#1').listing).map(ticket => ticket.title),
        ).toEqual(['Checkout']);
        expect(ticketsIn(ticketView(tickets, 'bug', 'PAYMENT checkout').listing)).toHaveLength(1);
        expect(ticketsIn(ticketView(tickets, 'bug', 'docs').listing)).toEqual([]);
        expect(
            commandInView(ticketView(tickets, null, 'Docs'), {
                kind: 'step',
                id: 'ticket-11',
                step: 'up',
            }),
        ).toBeNull();
    });
});
