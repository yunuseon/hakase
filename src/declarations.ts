import { CONVERTERS, converterTitle, type ConverterKind } from './converters.ts';
import { GATES, type GateKind } from './gates.ts';
import {
    converterInputs,
    drumsInputs,
    focusInputs,
    gateInputs,
    imageInput,
    knobInputs,
    loosePlaybackInput,
    ownPlaybackInput,
    paintInput,
    pedalInputs,
    penInputs,
    playbackInput,
    plotInputs,
    progressInput,
    sceneInputs,
    signalInputs,
    sourceInput,
    voiceInputs,
    type InputsFor,
    type ProgramInputs,
} from './inputs.ts';
import { PEDALS, type PedalKind } from './pedals.ts';
import type { CategoryId, ProgramId } from './protocol.ts';

export type Declaration<K extends ProgramId = ProgramId> = {
    readonly id: K;
    readonly title: string;
    readonly category: CategoryId;
    readonly icon: string;
    readonly inputs: ProgramInputs;
};

export const pedalDeclaration = <K extends PedalKind>(kind: K) =>
    ({
        id: kind,
        title: PEDALS[kind].title.toLowerCase(),
        category: 'make',
        icon: PEDALS[kind].icon,
        inputs: { playback: playbackInput, ...pedalInputs(kind) },
    }) satisfies Declaration<K>;

export const gateDeclaration = <K extends GateKind>(kind: K) =>
    ({
        id: kind,
        title: GATES[kind].title.toLowerCase(),
        category: 'logic',
        icon: GATES[kind].icon,
        inputs: { playback: loosePlaybackInput, ...gateInputs(kind) },
    }) satisfies Declaration<K>;

export const converterDeclaration = <K extends ConverterKind>(kind: K) =>
    ({
        id: kind,
        title: converterTitle(kind),
        category: 'convert',
        icon: CONVERTERS[kind].icon,
        inputs: { playback: playbackInput, ...converterInputs(kind) },
    }) satisfies Declaration<K>;

export const declarations = {
    formula: {
        id: 'formula',
        title: 'formula',
        category: 'make',
        icon: 'M9.5 8 L5.5 12 L9.5 16 M14.5 8 L18.5 12 L14.5 16',
        inputs: {},
    },
    theme: {
        id: 'theme',
        title: 'theme',
        category: 'make',
        icon: 'M4 6 H20 V18 H4 Z M10 6 V18 M15 6 V18',
        inputs: {},
    },
    appearance: {
        id: 'appearance',
        title: 'appearance',
        category: 'system',
        icon: 'M12 4 a8 8 0 1 0 0 16 c1.2 0 1.6-.9 1.2-1.8 c-.5-1 .2-2.2 1.4-2.2 H17 a3 3 0 0 0 3-3 C20 7.4 16.4 4 12 4 Z M7.5 12 h.01 M9.5 8 h.01 M14.5 8 h.01',
        inputs: {},
    },
    sketch: {
        id: 'sketch',
        title: 'sketch',
        category: 'make',
        icon: 'M3 14 Q 7.5 5.5 12 13 T 21 11',
        inputs: { playback: playbackInput, ...knobInputs, ...sceneInputs, paint: paintInput },
    },
    timeline: {
        id: 'timeline',
        title: 'timeline',
        category: 'make',
        icon: 'M3 12 H21 M7.5 9.5 V14.5 M12 8 V16 M16.5 9.5 V14.5',
        inputs: { playback: ownPlaybackInput },
    },
    playhead: {
        id: 'playhead',
        title: 'playhead',
        category: 'make',
        icon: 'M12 12 m -8 0 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0 M12 12 L12 4.4',
        inputs: { progress: progressInput },
    },
    signal: {
        id: 'signal',
        title: 'signal',
        category: 'make',
        icon: 'M3 12 C 6 3, 9 3, 12 12 S 18 21, 21 12',
        inputs: { playback: playbackInput, ...signalInputs },
    },
    plot: {
        id: 'plot',
        title: 'plot',
        category: 'make',
        icon: 'M4 4 V20 H20 M7 15 C10 5, 12 5, 14 11 S 18 18, 20 8',
        inputs: { playback: playbackInput, ...plotInputs },
    },
    paint: {
        id: 'paint',
        title: 'paint',
        category: 'make',
        icon: 'M5 19 C5 15 8 14 10 14 L18 6 L20 8 L12 16 C12 18 10 20 5 19 Z',
        inputs: { playback: playbackInput },
    },
    pen: {
        id: 'pen',
        title: 'pen',
        category: 'make',
        icon: 'M4 20 C8 8 12 16 15 9 S 19 6 20 4 M17 3 L21 7',
        inputs: { playback: playbackInput, ...penInputs },
    },
    voice: {
        id: 'voice',
        title: 'voice',
        category: 'make',
        icon: 'M9 18 V6 L19 4 V16 M9 18 A2.5 2.5 0 1 1 4 18 A2.5 2.5 0 1 1 9 18 M19 16 A2.5 2.5 0 1 1 14 16 A2.5 2.5 0 1 1 19 16',
        inputs: { playback: playbackInput, ...voiceInputs },
    },
    drums: {
        id: 'drums',
        title: 'drums',
        category: 'make',
        icon: 'M4 9 A8 3 0 0 1 20 9 V15 A8 3 0 0 1 4 15 Z M4 9 A8 3 0 0 0 20 9 M7 4 L11 8 M17 4 L13 8',
        inputs: { playback: playbackInput, ...drumsInputs },
    },
    mixer: {
        id: 'mixer',
        title: 'mixer',
        category: 'make',
        icon: 'M6 4 V20 M12 4 V20 M18 4 V20 M4 14 H8 M10 8 H14 M16 12 H20',
        inputs: {},
    },
    output: {
        id: 'output',
        title: 'output',
        category: 'make',
        icon: 'M3 5h18v12H3zM8 21h8M12 17v4',
        inputs: { playback: playbackInput, in: imageInput('in') },
    },
    colourmap: pedalDeclaration('colourmap'),
    kaleido: pedalDeclaration('kaleido'),
    feedback: pedalDeclaration('feedback'),
    mix: pedalDeclaration('mix'),
    blur: pedalDeclaration('blur'),
    nand: gateDeclaration('nand'),
    delay: gateDeclaration('delay'),
    switch: gateDeclaration('switch'),
    pattern: gateDeclaration('pattern'),
    compare: gateDeclaration('compare'),
    lamp: gateDeclaration('lamp'),
    'pin-in': gateDeclaration('pin-in'),
    'pin-out': gateDeclaration('pin-out'),
    'schedule-level': converterDeclaration('schedule-level'),
    'sound-level': converterDeclaration('sound-level'),
    'timer-level': converterDeclaration('timer-level'),
    'tasks-level': converterDeclaration('tasks-level'),
    'level-level': converterDeclaration('level-level'),
    'level-bit': converterDeclaration('level-bit'),
    'schedule-bit': converterDeclaration('schedule-bit'),
    'timer-bit': converterDeclaration('timer-bit'),
    'tasks-bit': converterDeclaration('tasks-bit'),
    'sound-bit': converterDeclaration('sound-bit'),
    'clock-level': converterDeclaration('clock-level'),
    'clock-bit': converterDeclaration('clock-bit'),
    'zones-level': converterDeclaration('zones-level'),
    'zones-bit': converterDeclaration('zones-bit'),
    'habits-level': converterDeclaration('habits-level'),
    'habits-bit': converterDeclaration('habits-bit'),
    'picture-level': converterDeclaration('picture-level'),
    box: {
        id: 'box',
        title: 'component',
        category: 'logic',
        icon: 'M4 6h16v12H4zM2 10h2M2 14h2M20 12h2M8 10h8M8 14h5',
        inputs: { playback: loosePlaybackInput },
    },
    blueprints: {
        id: 'blueprints',
        title: 'blueprints',
        category: 'make',
        icon: 'M4 5 H11 V12 H4 Z M13 5 H20 V9 H13 Z M13 11 H20 V19 H13 Z M4 14 H11 V19 H4 Z',
        inputs: {},
    },
    tasks: {
        id: 'tasks',
        title: 'tasks',
        category: 'system',
        icon: 'M4 6 H4.01 M8 6 H20 M4 12 H4.01 M8 12 H20 M4 18 H4.01 M8 18 H20',
        inputs: {},
    },
    tickets: {
        id: 'tickets',
        title: 'tickets',
        category: 'plan',
        icon: 'M4 6.5 H20 V10 A2 2 0 0 0 20 14 V17.5 H4 V14 A2 2 0 0 0 4 10 Z M9.5 6.5 V17.5',
        inputs: {},
    },
    note: {
        id: 'note',
        title: 'note',
        category: 'plan',
        icon: 'M5 4 H19 V14 L14 20 H5 Z M14 20 V14 H19 M8.5 9 H15.5 M8.5 12.5 H12.5',
        inputs: {},
    },
    focus: {
        id: 'focus',
        title: 'focus',
        category: 'plan',
        icon: 'M12 5 A7.5 7.5 0 1 1 12 20 A7.5 7.5 0 1 1 12 5 M12 9 V12.5 L14.5 14.5 M10 2.5 H14',
        inputs: { ...focusInputs },
    },
    agenda: {
        id: 'agenda',
        title: 'agenda',
        category: 'plan',
        icon: 'M4 6 H20 V20 H4 Z M4 10 H20 M8 3.5 V7.5 M16 3.5 V7.5 M7.5 13 H12.5 V17 H7.5 Z',
        inputs: {},
    },
    progress: {
        id: 'progress',
        title: 'progress',
        category: 'plan',
        icon: 'M3.5 9 H20.5 V15 H3.5 Z M3.5 12 H13',
        inputs: { source: sourceInput },
    },
    habits: {
        id: 'habits',
        title: 'habits',
        category: 'plan',
        icon: 'M4 5 H8 V9 H4 Z M10 5 H14 V9 H10 Z M16 5 H20 V9 H16 Z M4 11 H8 V15 H4 Z M10 11 H14 V15 H10 Z M4 17 H8 V21 H4 Z',
        inputs: {},
    },
    clocks: {
        id: 'clocks',
        title: 'clocks',
        category: 'plan',
        icon: 'M12 3.5 A8.5 8.5 0 1 1 12 20.5 A8.5 8.5 0 1 1 12 3.5 M3.5 12 H20.5 M12 3.5 C8.5 7 8.5 17 12 20.5 M12 3.5 C15.5 7 15.5 17 12 20.5',
        inputs: {},
    },
    bookmarks: {
        id: 'bookmarks',
        title: 'bookmarks',
        category: 'plan',
        icon: 'M7 3.5 H17 V20.5 L12 16.5 L7 20.5 Z',
        inputs: {},
    },
    history: {
        id: 'history',
        title: 'history',
        category: 'system',
        icon: 'M4 12 A8 8 0 1 0 6.5 6.2 M4 4 V8 H8 M12 8 V12 L15 14',
        inputs: {},
    },
    state: {
        id: 'state',
        title: 'state',
        category: 'system',
        icon: 'M5 6 h3 M5 12 h3 M5 18 h3 M16 6 h3 M16 12 h3 M16 18 h3 M8 6 C 12 6, 12 12, 16 12 M8 18 C 12 18, 12 6, 16 6',
        inputs: {},
    },
    storybook: {
        id: 'storybook',
        title: 'storybook',
        category: 'system',
        icon: 'M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15',
        inputs: {},
    },
} satisfies { readonly [K in ProgramId]: Declaration<K> };

export const declarationOf = (id: ProgramId): Declaration => declarations[id];

export const inputsFor: InputsFor = program => declarations[program].inputs;
