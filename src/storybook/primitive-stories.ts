import { merge } from 'rxjs';
import { map, scan, share, startWith } from 'rxjs/operators';
import { HksUiSpecimen } from '../components/ui-specimen/ui-specimen.component.ts';
import {
    initialSpecimen,
    reduceSpecimen,
    type SpecimenInput,
} from '../components/ui-specimen/ui-specimen.ts';
import { defaults, recorded, type Story } from './story.ts';

const specs = [
    {
        id: 'buttons',
        title: 'Buttons & icon actions',
        description: 'Subtle native buttons, inline + actions, emphasis and destructive actions.',
        elements: ['button', '.ui-button', '.ui-icon'],
        controls: ['label', 'disabled'],
        height: 230,
    },
    {
        id: 'fields',
        title: 'Text fields & validation',
        description: 'Text, search, multiline, placeholder, disabled and invalid states.',
        elements: ['input', 'textarea', '.ui-field'],
        controls: ['label', 'disabled'],
        height: 410,
    },
    {
        id: 'choices',
        title: 'Segmented choices',
        description:
            'Shared button and native radio segments, keyboard navigation, focus and disabled choices.',
        elements: ['.ui-choices', '.ui-choice', '.ui-segment'],
        controls: ['label', 'disabled'],
        height: 260,
    },
    {
        id: 'range',
        title: 'Ranges & checkboxes',
        description:
            'The same standard and precision ranges used by the creative tools, with a native checkbox.',
        elements: ['input[type=range]', 'input[type=checkbox]', '.ui-range', '.ui-check'],
        controls: ['label', 'value', 'disabled'],
        height: 230,
    },
    {
        id: 'colour',
        title: 'Colour swatches',
        description:
            'Round and rectangular native colour pickers used by the appearance and gradient editors.',
        elements: ['input[type=color]', '.ui-colour'],
        controls: ['label', 'disabled'],
        height: 200,
    },
    {
        id: 'badges',
        title: 'Badges & tags',
        description: 'Static, filterable and removable badges share one visual definition.',
        elements: ['.ui-badge'],
        controls: ['label', 'disabled'],
        height: 190,
    },
    {
        id: 'listen',
        title: 'Listen toggle',
        description: 'The shared voice and drums toggle, including muted and active icon states.',
        elements: ['.ui-listen', 'ListenIcon'],
        controls: ['label', 'disabled'],
        height: 190,
    },
    {
        id: 'icons',
        title: 'Action icons',
        description:
            'Shared path data and one SVG renderer. Labels belong to the surrounding control.',
        elements: ['Icon', 'ICONS'],
        controls: [],
        height: 290,
    },
    {
        id: 'symmetry',
        title: 'Brush symmetry icons',
        description:
            'The shared brush glyphs used by Paint and Pen, rendered from their actual symmetry definitions.',
        elements: ['SymmetryIcon'],
        controls: [],
        height: 190,
    },
    {
        id: 'jacks',
        title: 'Port jacks',
        description:
            'A jack is shaped by the type of its port, the same in state mode and on the state map. Its owner sets its size and colours.',
        elements: ['.ui-jack', 'PORT_TYPES'],
        controls: [],
        height: 300,
    },
    {
        id: 'empty',
        title: 'Empty states',
        description: 'Quiet empty-state copy with an inline creation action.',
        elements: ['.ui-empty'],
        controls: ['label', 'disabled'],
        height: 210,
    },
] as const;
export const primitiveStories: readonly Story[] = specs.map(spec => ({
    ...spec,
    elements: [...spec.elements, 'hks-ui-specimen'],
    id: `ui-${spec.id}`,
    group: 'Shared UI',
    variants: [{ id: 'default', title: 'Default' }],
    defaults: {
        ...defaults,
        label: spec.id === 'badges' ? 'Design' : spec.id === 'listen' ? 'Listen' : 'Example',
    },
    action: null,
    code: `import { controlsSheet } from './shared/ui/controls.component.ts';\n// Adopt before the component's own layout sheet.\nroot.adoptedStyleSheets = [controlsSheet, sheet];\n\n// Shared primitives: ${spec.elements.join(', ')}\n// Keep native buttons/inputs and their normal form semantics.`,
    create: ({ args$ }) => {
        const element = new HksUiSpecimen();
        const changes$ = element.changes$.pipe(share());
        const initial = { ...initialSpecimen, kind: spec.id };
        const view$ = merge(
            args$.pipe(map((args): SpecimenInput => ({ kind: 'args', ...args }))),
            changes$,
        ).pipe(scan(reduceSpecimen, initial), startWith(initial));
        return {
            element,
            run$: element.connect$(view$),
            events$: changes$.pipe(map(change => recorded(change.kind, change))),
        };
    },
}));
