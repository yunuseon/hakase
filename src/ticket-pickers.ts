import {
    blockerChoices,
    parentChoices,
    statusOf,
    tagsOf,
    ticketsIn,
    type Ticket,
    type Tickets,
} from './shared/tickets.ts';
import type { Choice, PickerView } from './components/search-picker/search-picker.ts';
import type { Draft } from './components/ticket-creator/ticket-creator.ts';

export const ticketChoices = (
    tickets: Tickets,
    candidates: readonly Ticket[] = ticketsIn(tickets),
): readonly Choice[] =>
    candidates.map(ticket => ({
        value: ticket.id,
        label: `#${ticket.number} ${ticket.title}`,
        hint: [statusOf(tickets, ticket.id)?.title ?? '', ...ticket.tags].join(' · '),
    }));

const ticketPicker = (
    title: string,
    options: readonly Choice[],
    selected: readonly string[],
    multiple: boolean,
): PickerView => ({ title, options, selected, multiple, create: false });

export const draftPickers = (tickets: Tickets, draft: Draft) => ({
    tags: {
        title: 'Tags',
        options: [...new Set([...tagsOf(tickets), ...draft.tags])]
            .sort()
            .map(tag => ({ value: tag, label: tag, hint: '' })),
        selected: draft.tags,
        multiple: true,
        create: true,
    } satisfies PickerView,
    parent: ticketPicker(
        'Parent ticket',
        ticketChoices(tickets),
        draft.parent === null ? [] : [draft.parent],
        false,
    ),
    blockers: ticketPicker('Blocked by', ticketChoices(tickets), draft.blockedBy, true),
});

export const detailPickers = (tickets: Tickets, id: string | null) => {
    const ticket = ticketsIn(tickets).find(ticket => ticket.id === id);
    return {
        ticket,
        parent: ticketPicker(
            'Parent ticket',
            ticket === undefined ? [] : ticketChoices(tickets, parentChoices(tickets, ticket.id)),
            ticket?.parent === undefined || ticket.parent === null ? [] : [ticket.parent],
            false,
        ),
        blockers: ticketPicker(
            'Select blockers',
            ticket === undefined
                ? []
                : ticketChoices(tickets, [
                      ...blockerChoices(tickets, ticket.id),
                      ...ticketsIn(tickets).filter(each => ticket.blockedBy.includes(each.id)),
                  ]),
            ticket?.blockedBy ?? [],
            true,
        ),
    };
};
