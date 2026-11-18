import type { MenuGroup } from '../../shared/menu.ts';
import type { TicketView } from '../../shared/tickets.ts';
import { ICONS } from '../../shared/ui/icons.ts';

export const ticketsMenu = ({ tickets, filter, query }: TicketView): readonly MenuGroup[] => {
    const done = tickets.statuses
        .filter(({ stage }) => stage === 'done')
        .reduce((count, status) => count + status.tickets.length, 0);

    // Not while filtering: clearing would delete completed tickets the list is not showing.
    return filter !== null || query.trim() !== ''
        ? []
        : [
              {
                  id: 'tickets',
                  items: [
                      {
                          id: 'clear-done',
                          label:
                              done === 0
                                  ? 'Nothing done to clear'
                                  : `Clear ${done === 1 ? '1 done ticket' : `${done} done tickets`}`,
                          glyph: ICONS.remove,
                          destructive: true,
                          disabled: done === 0,
                      },
                  ],
              },
          ];
};
