import {
    currentBlock,
    nextBlock,
    timeOf,
    type Agenda,
    type Block,
} from './components/agenda/agenda.ts';
import { focusView, type Focus } from './components/focus/focus.ts';
import type { Reading } from './components/progress-bar/progress-bar.ts';

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

export const focusReading = (focus: Focus): Reading => {
    const view = focusView(focus);

    return {
        kind: 'now',
        title: view.label,
        at: view.progress,
        remaining: focus.remaining,
        running: focus.running,
        span: null,
    };
};
