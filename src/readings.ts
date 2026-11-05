import {
    currentBlock,
    nextBlock,
    timeOf,
    type Agenda,
    type Block,
} from './components/agenda/agenda.ts';
import { focusView, type Focus, type FocusLink, type Plan } from './components/focus/focus.ts';
import type { Reading } from './components/progress-bar/progress-bar.ts';
import { factsOf, type Tickets } from './shared/tickets.ts';

const MINUTE = 60_000;

const titleOf = ({ title }: Block): string => (title === '' ? 'Untitled' : title);

const spanOf = ({ start, end }: Block) => ({ start: timeOf(start), end: timeOf(end) });

export const agendaReading = (agenda: Agenda, day: string, minute: number): Reading => {
    const current = currentBlock(agenda, day, minute);

    if (current !== null) {
        return {
            kind: 'now',
            title: titleOf(current),
            at: (minute - current.start) / (current.end - current.start),
            remaining: (current.end - minute) * MINUTE,
            running: true,
            span: spanOf(current),
        };
    }

    const next = nextBlock(agenda, day, minute);

    return next === null
        ? { kind: 'none', title: 'Nothing else planned today' }
        : {
              kind: 'next',
              title: titleOf(next),
              remaining: (next.start - minute) * MINUTE,
              span: spanOf(next),
          };
};

export const planOf = (agenda: Agenda, day: string, minute: number): Plan | null => {
    const block = currentBlock(agenda, day, minute);

    return block === null
        ? null
        : {
              id: block.id,
              title: titleOf(block),
              elapsed: (minute - block.start) * MINUTE,
              length: (block.end - block.start) * MINUTE,
          };
};

// Every timer that follows an agenda with a block running now, keyed by the timer's store.
export const plansOf = (
    links: ReadonlyMap<string, FocusLink>,
    agendas: ReadonlyMap<string, Agenda>,
    day: string,
    minute: number,
): ReadonlyMap<string, Plan> =>
    new Map(
        [...links].flatMap(([store, { sources }]) => {
            const agenda = sources.agenda === null ? undefined : agendas.get(sources.agenda);
            const plan = agenda === undefined ? null : planOf(agenda, day, minute);

            return plan === null ? [] : [[store, plan] as const];
        }),
    );

export const focusReading = (focus: Focus, plan: Plan | null): Reading => {
    const view = focusView(focus, plan);

    return {
        kind: 'now',
        title: view.label,
        at: view.progress,
        remaining: plan === null ? focus.remaining : plan.length - plan.elapsed,
        running: view.running,
        span: null,
    };
};

export const ticketsReading = (tickets: Tickets): Reading => {
    const facts = [...factsOf(tickets).values()];

    return facts.length === 0
        ? { kind: 'none', title: 'Nothing to do' }
        : {
              kind: 'count',
              title: 'Tickets',
              done: facts.filter(({ done }) => done).length,
              total: facts.length,
          };
};
