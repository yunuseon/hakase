import type { Program, ProgramId } from './program.ts';
import { agendaProgram } from './programs/agenda.program.ts';
import { appearanceProgram } from './programs/appearance.program.ts';
import { boardProgram } from './programs/board.program.ts';
import { bookmarksProgram } from './programs/bookmarks.program.ts';
import { clocksProgram } from './programs/clocks.program.ts';
import { focusProgram } from './programs/focus.program.ts';
import { formulaProgram } from './programs/formula.program.ts';
import { habitsProgram } from './programs/habits.program.ts';
import { historyProgram } from './programs/history.program.ts';
import { stateProgram } from './programs/state.program.ts';
import { noteProgram } from './programs/note.program.ts';
import { playheadProgram } from './programs/playhead.program.ts';
import { signalProgram } from './programs/signal.program.ts';
import { sketchProgram } from './programs/sketch.program.ts';
import { tasksProgram } from './programs/tasks.program.ts';
import { themeProgram } from './programs/theme.program.ts';
import { timelineProgram } from './programs/timeline.program.ts';
import { todoProgram } from './programs/todo.program.ts';

export const programs = {
    formula: formulaProgram,
    theme: themeProgram,
    appearance: appearanceProgram,
    sketch: sketchProgram,
    timeline: timelineProgram,
    playhead: playheadProgram,
    signal: signalProgram,
    tasks: tasksProgram,
    todo: todoProgram,
    board: boardProgram,
    note: noteProgram,
    focus: focusProgram,
    agenda: agendaProgram,
    habits: habitsProgram,
    clocks: clocksProgram,
    bookmarks: bookmarksProgram,
    history: historyProgram,
    state: stateProgram,
} satisfies { readonly [K in ProgramId]: Program<K> };
