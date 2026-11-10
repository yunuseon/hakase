import { storybookProgram } from './programs/storybook.program.ts';
import type { InputsFor } from './inputs.ts';
import type { Program, ProgramId } from './program.ts';
import { agendaProgram } from './programs/agenda.program.ts';
import { appearanceProgram } from './programs/appearance.program.ts';
import { bookmarksProgram } from './programs/bookmarks.program.ts';
import { clocksProgram } from './programs/clocks.program.ts';
import { focusProgram } from './programs/focus.program.ts';
import { formulaProgram } from './programs/formula.program.ts';
import { habitsProgram } from './programs/habits.program.ts';
import { historyProgram } from './programs/history.program.ts';
import { stateProgram } from './programs/state.program.ts';
import { noteProgram } from './programs/note.program.ts';
import { playheadProgram } from './programs/playhead.program.ts';
import { paintProgram } from './programs/paint.program.ts';
import { penProgram } from './programs/pen.program.ts';
import { voiceProgram } from './programs/voice.program.ts';
import { drumsProgram } from './programs/drums.program.ts';
import { blueprintsProgram } from './programs/blueprints.program.ts';
import { progressProgram } from './programs/progress.program.ts';
import { plotProgram } from './programs/plot.program.ts';
import { outputProgram } from './programs/output.program.ts';
import { signalProgram } from './programs/signal.program.ts';
import { sketchProgram } from './programs/sketch.program.ts';
import { tasksProgram } from './programs/tasks.program.ts';
import { themeProgram } from './programs/theme.program.ts';
import { timelineProgram } from './programs/timeline.program.ts';
import { ticketsProgram } from './programs/tickets.program.ts';

export const programs = {
    formula: formulaProgram,
    theme: themeProgram,
    appearance: appearanceProgram,
    sketch: sketchProgram,
    timeline: timelineProgram,
    playhead: playheadProgram,
    signal: signalProgram,
    plot: plotProgram,
    paint: paintProgram,
    pen: penProgram,
    voice: voiceProgram,
    drums: drumsProgram,
    output: outputProgram,
    blueprints: blueprintsProgram,
    tasks: tasksProgram,
    tickets: ticketsProgram,
    note: noteProgram,
    focus: focusProgram,
    agenda: agendaProgram,
    progress: progressProgram,
    habits: habitsProgram,
    clocks: clocksProgram,
    bookmarks: bookmarksProgram,
    history: historyProgram,
    state: stateProgram,
    storybook: storybookProgram,
} satisfies { readonly [K in ProgramId]: Program<K> };

// In toolbar order: a record keeps its keys in the order they were written.
export const programList = Object.values(programs);

export const programOf = (id: ProgramId) => programs[id];

// The programs declare what they read from others; the workspace asks through this, never the table itself.
export const inputsFor: InputsFor = program => programs[program].inputs;
