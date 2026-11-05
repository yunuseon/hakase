import { describe, expect, it } from 'vitest';
import { closedCreation } from './components/ticket-creator/ticket-creator.ts';
import { detailPickers, draftPickers } from './ticket-pickers.ts';
import { defaultTickets, reduceTickets, type TicketCommand } from './shared/tickets.ts';

const commands: readonly TicketCommand[] = [
    { kind: 'add', title: 'Parent', status: null, parent: null },
    { kind: 'add', title: 'Child', status: null, parent: 'ticket-10', tags: ['work'] },
    { kind: 'block', id: 'ticket-11', by: 'ticket-10' },
];
const tickets = commands.reduce(
    (state, command, index) => reduceTickets(state, command, { seq: 10 + index }),
    defaultTickets,
);

describe('ticket pickers', () => {
    it('keeps cycle-forming parents and blockers out of existing ticket choices', () => {
        expect(detailPickers(tickets, 'ticket-10').parent.options).toEqual([]);
        expect(detailPickers(tickets, 'ticket-10').blockers.options).toEqual([]);
        const child = detailPickers(tickets, 'ticket-11');
        expect(child.parent.selected).toEqual(['ticket-10']);
        expect(child.blockers.selected).toEqual(['ticket-10']);
        expect(child.blockers.options.map(option => option.value)).toEqual(['ticket-10']);
    });
    it('offers existing tags and ticket references for new work', () => {
        const pickers = draftPickers(tickets, { ...closedCreation.draft, tags: ['new'] });
        expect(pickers.tags.options.map(option => option.value)).toEqual(['new', 'work']);
        expect(pickers.parent.options.map(option => option.label)).toEqual([
            '#1 Parent',
            '#2 Child',
        ]);
        expect(pickers.tags.create).toBe(true);
    });
});
