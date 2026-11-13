import type { Program } from '../program.ts';
import type { Settings } from '../settings.ts';
import { defaultSketch } from '../settings.ts';
import { agendaProgram } from '../programs/agenda.program.ts';
import { appearanceProgram } from '../programs/appearance.program.ts';
import { bookmarksProgram } from '../programs/bookmarks.program.ts';
import { clocksProgram } from '../programs/clocks.program.ts';
import { focusProgram } from '../programs/focus.program.ts';
import { formulaProgram } from '../programs/formula.program.ts';
import { habitsProgram } from '../programs/habits.program.ts';
import { historyProgram } from '../programs/history.program.ts';
import { stateProgram } from '../programs/state.program.ts';
import { noteProgram } from '../programs/note.program.ts';
import { playheadProgram } from '../programs/playhead.program.ts';
import { paintProgram } from '../programs/paint.program.ts';
import { penProgram } from '../programs/pen.program.ts';
import { blueprintsProgram } from '../programs/blueprints.program.ts';
import { progressProgram } from '../programs/progress.program.ts';
import { plotProgram } from '../programs/plot.program.ts';
import { converterProgram } from '../programs/converter.program.ts';

const timingProgram = converterProgram('schedule-level');
import { signalProgram } from '../programs/signal.program.ts';
import { sketchProgram } from '../programs/sketch.program.ts';
import { tasksProgram } from '../programs/tasks.program.ts';
import { themeProgram } from '../programs/theme.program.ts';
import { timelineProgram } from '../programs/timeline.program.ts';
import { ticketsProgram } from '../programs/tickets.program.ts';
import { defaults, type Story } from './story.ts';
import { programDemo } from './program-demo.ts';

export const specimenPrograms: readonly Program[] = [
    ticketsProgram,
    noteProgram,
    focusProgram,
    agendaProgram,
    habitsProgram,
    clocksProgram,
    bookmarksProgram,
    formulaProgram,
    appearanceProgram,
    themeProgram,
    signalProgram,
    plotProgram,
    timingProgram,
    paintProgram,
    penProgram,
    sketchProgram,
    timelineProgram,
    playheadProgram,
    progressProgram,
    blueprintsProgram,
    tasksProgram,
    historyProgram,
    stateProgram,
];
type Spec = {
    readonly program: Program;
    readonly title: string;
    readonly elements: readonly string[];
    readonly description: string;
    readonly variants: readonly {
        readonly id: string;
        readonly title: string;
        readonly settings?: Settings;
        readonly empty?: boolean;
    }[];
};
const populated = [
    { id: 'populated', title: 'Populated' },
    { id: 'empty', title: 'Empty', empty: true },
];
const normal = [{ id: 'default', title: 'Default' }];
const specs: readonly Spec[] = [
    {
        program: ticketsProgram,
        title: 'Tickets',
        elements: ['hks-tickets', 'hks-ticket-creator', 'hks-search-picker'],
        description:
            'List, board, detail and the creation wizard. Use the inline + to start a ticket.',
        variants: [
            { id: 'list', title: 'List', settings: { kind: 'tickets', view: 'list' } },
            { id: 'board', title: 'Board', settings: { kind: 'tickets', view: 'board' } },
            { id: 'empty', title: 'Empty', empty: true },
        ],
    },
    {
        program: noteProgram,
        title: 'Note editor',
        elements: ['hks-note'],
        description: 'An editable document with a quiet footer, document picker and word count.',
        variants: [
            { id: 'written', title: 'Written', settings: { kind: 'note', note: 'note-1' } },
            { id: 'blank', title: 'Blank', empty: true },
        ],
    },
    {
        program: focusProgram,
        title: 'Focus timer',
        elements: ['hks-focus'],
        description: 'Timer phases, progress ring, durations and subtle transport controls.',
        variants: normal,
    },
    {
        program: agendaProgram,
        title: 'Agenda',
        elements: ['hks-agenda'],
        description:
            'A day grid with editable, draggable time blocks. Double-click the grid to add one.',
        variants: normal,
    },
    {
        program: habitsProgram,
        title: 'Habit tracker',
        elements: ['hks-habits'],
        description: 'A compact calendar, streaks and inline editing.',
        variants: populated,
    },
    {
        program: clocksProgram,
        title: 'World clocks',
        elements: ['hks-clocks'],
        description: 'Time-zone search and relative offsets.',
        variants: populated,
    },
    {
        program: bookmarksProgram,
        title: 'Bookmarks',
        elements: ['hks-bookmarks'],
        description: 'Grouped links, inline forms and ordering controls.',
        variants: normal,
    },
    {
        program: formulaProgram,
        title: 'Code editor',
        elements: ['hks-formula-editor'],
        description:
            'Highlighted source, documentation, document picker and status footer. Edits stay in the sandbox.',
        variants: normal,
    },
    {
        program: appearanceProgram,
        title: 'Appearance editor',
        elements: ['hks-appearance-editor'],
        description:
            'Semantic colour tokens and preset selection. Colour edits affect this fixture only.',
        variants: normal,
    },
    {
        program: themeProgram,
        title: 'Gradient editor',
        elements: ['hks-theme-editor'],
        description: 'Colour stops and smooth or stepped interpolation.',
        variants: [
            { id: 'smooth', title: 'Smooth', settings: { kind: 'theme', theme: 'paper' } },
            { id: 'steps', title: 'Steps', settings: { kind: 'theme', theme: 'bands' } },
        ],
    },
    {
        program: signalProgram,
        title: 'Signal editor',
        elements: ['hks-signal'],
        description: 'Wave shapes, parameter controls and a live waveform.',
        variants: normal,
    },
    {
        program: timingProgram,
        title: 'Converter',
        elements: ['hks-converter'],
        description:
            'A converter turns one type into another: here schedule → level, with its readings and the shape every level converter shares.',
        variants: normal,
    },
    {
        program: plotProgram,
        title: 'Signal plot',
        elements: ['hks-plot'],
        description: 'Overlay and lane layouts with an isolated example signal.',
        variants: [
            { id: 'overlay', title: 'Overlay', settings: { kind: 'plot', layout: 'overlay' } },
            { id: 'lanes', title: 'Lanes', settings: { kind: 'plot', layout: 'lanes' } },
            { id: 'empty', title: 'Unconnected', empty: true },
        ],
    },
    {
        program: paintProgram,
        title: 'Paint',
        elements: ['hks-paint'],
        description: 'Pixel drawing, brush controls, symmetry and animation frames.',
        variants: normal,
    },
    {
        program: penProgram,
        title: 'Pen',
        elements: ['hks-pen'],
        description: 'Stroke preview and signal-driven pen controls.',
        variants: normal,
    },
    {
        program: sketchProgram,
        title: 'Sketch & animation',
        elements: [
            'hks-sketch',
            'hks-sketch-controls',
            'hks-frame-strip',
            'hks-export-panel',
            'hks-fps-counter',
        ],
        description:
            'The real WebGL renderer with its parameter panel, frame strip, export controls and status counter. Only the selected story holds GPU resources.',
        variants: [
            { id: 'dots', title: 'Dots' },
            {
                id: 'lines',
                title: 'Lines',
                settings: { ...defaultSketch, panel: { ...defaultSketch.panel, mode: 'lines' } },
            },
            {
                id: 'surface',
                title: 'Surface',
                settings: { ...defaultSketch, panel: { ...defaultSketch.panel, mode: 'surface' } },
            },
        ],
    },
    {
        program: timelineProgram,
        title: 'Timeline',
        elements: ['hks-linear-slider', 'hks-transport'],
        description: 'A scrubber with slotted play, stop, loop and duration controls.',
        variants: normal,
    },
    {
        program: playheadProgram,
        title: 'Playhead dial',
        elements: ['hks-circular-slider'],
        description: 'A circular scrubber which adapts to the shorter side of its container.',
        variants: normal,
    },
    {
        program: progressProgram,
        title: 'Progress',
        elements: ['hks-progress-bar'],
        description: 'Ticket completion as a compact, read-only progress view.',
        variants: normal,
    },
    {
        program: blueprintsProgram,
        title: 'Blueprint cards',
        elements: ['hks-blueprints'],
        description:
            'Starter layouts and miniature workspace previews. Placement requests are logged.',
        variants: normal,
    },
    {
        program: tasksProgram,
        title: 'Task manager',
        elements: ['hks-task-manager'],
        description:
            'Process rows with reveal and close actions. Requests are logged without touching real windows.',
        variants: populated,
    },
    {
        program: historyProgram,
        title: 'History',
        elements: ['hks-history'],
        description:
            'History entries and reversal actions. Requests are logged without changing workspace history.',
        variants: populated,
    },
    {
        program: stateProgram,
        title: 'State map',
        elements: ['hks-state-map'],
        description:
            'Document nodes, window nodes, wiring and the state inspector over fixture data.',
        variants: populated,
    },
];
export const programStories: readonly Story[] = specs.map(spec => ({
    id: spec.program.id,
    title: spec.title,
    group:
        spec.program.category === 'plan'
            ? 'Planning'
            : spec.program.category === 'make'
              ? 'Creative tools'
              : 'System',
    description: `${spec.description} Compact previews use a 240px content width; controls reflow while spatial editors keep their own scroll area.`,
    elements: spec.elements,
    variants: [...spec.variants, { id: 'compact', title: 'Compact (240px)' }],
    controls: [],
    defaults,
    height: Math.min(780, Math.max(220, spec.program.size.height)),
    code: `import { ${spec.program.id}Program } from './programs/${spec.program.id}.program.ts';\n\nconst preview = ${spec.program.id}Program.launch();\n// Mount preview.element; connect its lifetime to the owning process.\nconst events$ = preview.run$(state, self);`,
    action: null,
    create: ({ variant }) => {
        const selected = spec.variants.find(item => item.id === variant);
        const demo = programDemo(spec.program, selected?.settings, selected?.empty);
        if (variant === 'compact') {
            demo.element.style.inlineSize = 'min(100%, 240px)';
            demo.element.style.blockSize = `${spec.program.minimum.height}px`;
        }
        return demo;
    },
}));
