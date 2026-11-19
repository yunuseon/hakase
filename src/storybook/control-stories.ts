import { combineLatest, EMPTY, merge, of } from 'rxjs';
import { map, mergeMap, scan, share, shareReplay, startWith, tap } from 'rxjs/operators';
import { HksSelect } from '../shared/select/select.component.ts';
import { renderOptions } from '../shared/select/options.component.ts';
import { HksSearchPicker } from '../components/search-picker/search-picker.component.ts';
import { HksProgressBar } from '../components/progress-bar/progress-bar.component.ts';
import { HksLinearSlider } from '../components/slider/linear/linear-slider.component.ts';
import { HksCircularSlider } from '../components/slider/circular/circular-slider.component.ts';
import { HksVoice } from '../components/voice/voice.component.ts';
import { voiceCommandOf, voiceSections } from '../components/voice/voice-controls.ts';
import { defaultVoice, notesOf, reduceVoice, soundingOf } from '../model/voice.ts';
import { HksDrums } from '../components/drums/drums.component.ts';
import { drumsCommandOf, drumsSections } from '../components/drums/drums-controls.ts';
import { defaultDrums, reduceDrums } from '../model/drums.ts';
import { converterSections, type ConverterControls } from '../components/converter/converter.ts';
import { HksProperties } from '../shared/ui/properties.component.ts';
import { HksMenu } from '../shared/ui/menu.component.ts';
import { formulaMenu } from '../components/formula-editor/formula-menu.ts';
import { noteMenu } from '../components/note/note-menu.ts';
import { defaults, recorded, type Story } from './story.ts';

const propertiesFixture = (variant: string): ConverterControls => ({
    choices: [
        { id: 'loudness', title: 'loudness' },
        { id: 'pitch', title: 'pitch' },
        { id: 'drum', title: 'one drum' },
    ],
    choice: 'loudness',
    items:
        variant === 'items'
            ? ['Tokyo', 'Lagos', 'Lima', 'Oslo', 'Perth', 'Quito'].map(title => ({
                  id: title.toLowerCase(),
                  title,
              }))
            : [],
    item: 'tokyo',
    shape:
        variant === 'bit'
            ? null
            : {
                  low: 0,
                  high: 1,
                  fit: false,
                  invert: false,
                  curve: 0,
                  steps: 0,
                  smooth: 0,
                  grid: 0,
              },
    bits: variant === 'bit' ? { invert: false, hold: 0, threshold: 0.5, band: 0.05 } : null,
    thresholded: variant === 'bit',
});

const normal = [{ id: 'default', title: 'Default' }];
export const controlStories: readonly Story[] = [
    {
        id: 'select',
        title: 'Select & autocomplete',
        group: 'Controls',
        description:
            'The shared keyboard-accessible dropdown, with search, disabled state and editable suggestions.',
        elements: ['hks-select'],
        variants: [
            { id: 'select', title: 'Select' },
            { id: 'editable', title: 'Autocomplete' },
            { id: 'empty', title: 'No options' },
        ],
        controls: ['label', 'disabled'],
        defaults: { ...defaults, label: 'Choose a material' },
        height: 260,
        action: null,
        code: "const select = new HksSelect();\nconst options = renderOptions(select);\noptions.update([{ value: 'paper', label: 'Paper' }]);\nconst lifetime$ = merge(options.lifetime$, select.connect$());\nconst picks$ = select.changes$;",
        create: ({ args$, variant }) => {
            const element = new HksSelect();
            const options = renderOptions(element);
            options.update(
                variant === 'empty'
                    ? []
                    : ['Paper', 'Canvas', 'Ink', 'Clay', 'Wood', 'Glass'].map(label => ({
                          value: label.toLowerCase(),
                          label,
                      })),
            );
            if (variant === 'editable') {
                element.setAttribute('editable', '');
            }
            return {
                element,
                run$: merge(
                    options.lifetime$,
                    element.connect$(),
                    args$.pipe(
                        tap(args => {
                            element.disabled = args.disabled;
                            element.setAttribute('aria-label', args.label);
                            element.setAttribute('placeholder', args.label);
                        }),
                    ),
                ),
                events$: element.changes$.pipe(map(value => recorded('change', value))),
            };
        },
    },
    {
        id: 'picker',
        title: 'Search picker',
        group: 'Controls',
        description: 'Searchable choices with optional multiple selection and inline tag creation.',
        elements: ['hks-search-picker'],
        variants: [
            { id: 'single', title: 'Single' },
            { id: 'multiple', title: 'Multiple' },
            { id: 'create', title: 'Create tags' },
            { id: 'empty', title: 'No matches' },
        ],
        controls: ['label'],
        defaults: { ...defaults, label: 'Tags' },
        height: 310,
        action: null,
        code: 'const picker = new HksSearchPicker();\nconst lifetime$ = picker.connect$(view$);\n// view: { title, options, selected, multiple, create }\nconst picks$ = picker.picks$;',
        create: ({ args$, variant }) => {
            const element = new HksSearchPicker();
            const picks$ = element.picks$.pipe(share());
            const selected$ = picks$.pipe(
                scan(
                    (selected: readonly string[], value) =>
                        variant === 'single'
                            ? [value]
                            : selected.includes(value)
                              ? selected.filter(item => item !== value)
                              : [...selected, value],
                    [],
                ),
                startWith([]),
                shareReplay({ bufferSize: 1, refCount: true }),
            );
            return {
                element,
                run$: element.connect$(
                    combineLatest([args$, selected$]).pipe(
                        map(([args, selected]) => ({
                            title: args.label,
                            options:
                                variant === 'empty'
                                    ? []
                                    : [
                                          {
                                              value: 'design',
                                              label: 'Design',
                                              hint: 'Visual language',
                                          },
                                          {
                                              value: 'engineering',
                                              label: 'Engineering',
                                              hint: 'Implementation',
                                          },
                                          {
                                              value: 'research',
                                              label: 'Research',
                                              hint: 'Exploration',
                                          },
                                      ],
                            selected,
                            multiple: variant !== 'single',
                            create: variant === 'create',
                        })),
                    ),
                ),
                events$: picks$.pipe(map(value => recorded('pick', value))),
            };
        },
    },
    ...['linear', 'circular'].map((kind): Story => ({
        id: `${kind}-slider`,
        title: kind === 'linear' ? 'Linear slider' : 'Circular slider',
        group: 'Controls',
        description:
            'Drag to scrub. The value control and pointer gestures share the same preview.',
        elements: [`hks-${kind}-slider`],
        variants: normal,
        controls: ['value'],
        defaults,
        height: kind === 'linear' ? 150 : 280,
        action: null,
        code: `const slider = new ${kind === 'linear' ? 'HksLinearSlider' : 'HksCircularSlider'}();\nconst lifetime$ = slider.connect$(position$);\nconst scrubs$ = slider.changes$;`,
        create: ({ args$ }) => {
            const element = kind === 'linear' ? new HksLinearSlider() : new HksCircularSlider();
            const scrubs$ = element.changes$.pipe(share());
            const at$ = merge(
                args$.pipe(map(args => args.value / 100)),
                scrubs$.pipe(map(scrub => scrub.at)),
            ).pipe(shareReplay({ bufferSize: 1, refCount: true }));
            return {
                element,
                run$: element.connect$(at$),
                events$: scrubs$.pipe(map(scrub => recorded('scrub', scrub))),
            };
        },
    })),
    {
        id: 'progress-states',
        title: 'Progress states',
        group: 'Controls',
        description: 'Active, paused, upcoming and empty readings use the same component.',
        elements: ['hks-progress-bar'],
        variants: [
            { id: 'now', title: 'Active' },
            { id: 'paused', title: 'Paused' },
            { id: 'next', title: 'Upcoming' },
            { id: 'none', title: 'Empty' },
        ],
        controls: ['label', 'value'],
        defaults: { ...defaults, label: 'Make something' },
        height: 150,
        action: null,
        code: 'const progress = new HksProgressBar();\nconst lifetime$ = progress.connect$(barView$);',
        create: ({ args$, variant }) => {
            const element = new HksProgressBar();
            const state =
                variant === 'paused' || variant === 'next' || variant === 'none' ? variant : 'now';
            return {
                element,
                run$: element.connect$(
                    args$.pipe(
                        map(args => ({
                            state,
                            title: args.label,
                            detail:
                                state === 'none' ? 'Nothing scheduled' : `${args.value}% complete`,
                            fill: state === 'none' || state === 'next' ? 0 : args.value / 100,
                            start: '09:00',
                            end: '10:00',
                        })),
                    ),
                ),
                events$: EMPTY,
            };
        },
    },
    {
        id: 'voice',
        title: 'Voice controls',
        group: 'Creative tools',
        description:
            'Instrument controls and a piano roll. Audio requests are logged; this visual fixture is silent.',
        elements: ['hks-voice'],
        variants: [...normal, { id: 'compact', title: 'Compact (240px)' }],
        controls: ['value'],
        defaults,
        height: 420,
        action: null,
        code: "const voice = new HksVoice();\nconst properties = new HksProperties();\nproperties.slot = 'controls';\nvoice.append(properties);\nconst lifetime$ = merge(voice.connect$(heard$, position$, listening$), properties.connect$(voice$.pipe(map(voiceSections))));\nconst commands$ = properties.changes$.pipe(mergeMap(voiceCommandOf));",
        create: ({ args$, variant }) => {
            const element = new HksVoice();
            const properties = new HksProperties();
            properties.slot = 'controls';
            element.append(properties);
            if (variant === 'compact') {
                element.style.inlineSize = 'min(100%, 240px)';
                element.style.blockSize = '300px';
            }
            const commands$ = properties.changes$.pipe(mergeMap(voiceCommandOf), share());
            const voice$ = commands$.pipe(
                scan(reduceVoice, defaultVoice),
                startWith(defaultVoice),
                shareReplay({ bufferSize: 1, refCount: true }),
            );
            const heard$ = voice$.pipe(
                map(voice => soundingOf(voice, new Map())),
                map(sounding => ({ sounding, notes: notesOf(sounding) })),
            );
            return {
                element,
                run$: merge(
                    element.connect$(heard$, args$.pipe(map(args => args.value / 100)), of(false)),
                    properties.connect$(voice$.pipe(map(voiceSections))),
                ),
                events$: merge(
                    element.changes$.pipe(map(event => recorded(event.kind, event))),
                    commands$.pipe(map(command => recorded('command', command))),
                ),
            };
        },
    },
    {
        id: 'drums',
        title: 'Drum sequencer',
        group: 'Creative tools',
        description:
            'Pattern cells, presets, accents and step counts. Swipe the row labels to scroll a wide pattern; drag cells to paint. Audio requests are logged; this visual fixture is silent.',
        elements: ['hks-drums'],
        variants: [...normal, { id: 'compact', title: 'Compact (240px)' }],
        controls: ['value'],
        defaults,
        height: 420,
        action: null,
        code: "const drums = new HksDrums();\nconst properties = new HksProperties();\nproperties.slot = 'controls';\ndrums.append(properties);\nconst lifetime$ = merge(drums.connect$(pattern$, position$, listening$), properties.connect$(pattern$.pipe(map(drumsSections))));\nconst commands$ = properties.changes$.pipe(mergeMap(drumsCommandOf));",
        create: ({ args$, variant }) => {
            const element = new HksDrums();
            const properties = new HksProperties();
            properties.slot = 'controls';
            element.append(properties);
            if (variant === 'compact') {
                element.style.inlineSize = 'min(100%, 240px)';
                element.style.blockSize = '300px';
            }
            const events$ = element.changes$.pipe(share());
            const commands$ = merge(
                events$.pipe(mergeMap(event => (event.kind === 'command' ? [event.command] : []))),
                properties.changes$.pipe(mergeMap(drumsCommandOf)),
            ).pipe(share());
            const pattern$ = commands$.pipe(
                scan(reduceDrums, defaultDrums),
                startWith(defaultDrums),
                shareReplay({ bufferSize: 1, refCount: true }),
            );
            return {
                element,
                run$: merge(
                    element.connect$(
                        pattern$,
                        args$.pipe(map(args => args.value / 100)),
                        of(false),
                    ),
                    properties.connect$(pattern$.pipe(map(drumsSections))),
                ),
                events$: merge(
                    events$.pipe(map(event => recorded(event.kind, event))),
                    commands$.pipe(map(command => recorded('command', command))),
                ),
            };
        },
    },
    {
        id: 'properties',
        title: 'Properties',
        group: 'Controls',
        description:
            "A program's settings as data, rendered on one aligned grid of label, control and value. A row of choices that does not fit becomes a select, number fields fit their value, and in a compact window titled sections fold into rows that open in place.",
        elements: ['hks-properties', 'Section', 'Property', 'PropertyChange'],
        variants: [
            { id: 'level', title: 'Shape (a level)' },
            { id: 'bit', title: 'Threshold (a bit)' },
            { id: 'items', title: 'Many choices' },
        ],
        controls: [],
        defaults,
        height: 420,
        action: null,
        code: "const properties = new HksProperties();\nconst lifetime$ = properties.connect$(sections$);\n// sections: [section('shape', 'Shape', [{ kind: 'range', id: 'shape.curve', label: 'curve', value, min, max, step, text }])]\nconst changes$ = properties.changes$; // { id, value }",
        create: ({ variant }) => {
            const element = new HksProperties();
            const changes$ = element.changes$.pipe(share());
            const controls$ = changes$.pipe(
                scan((controls, { id, value }) => {
                    const field = id.split('.')[1] ?? '';
                    return id === 'reading' && typeof value === 'string'
                        ? { ...controls, choice: value }
                        : id === 'item' && typeof value === 'string'
                          ? { ...controls, item: value }
                          : id.startsWith('shape.') && controls.shape !== null
                            ? { ...controls, shape: { ...controls.shape, [field]: value } }
                            : id.startsWith('bits.') && controls.bits !== null
                              ? { ...controls, bits: { ...controls.bits, [field]: value } }
                              : controls;
                }, propertiesFixture(variant)),
                startWith(propertiesFixture(variant)),
            );
            return {
                element,
                run$: element.connect$(controls$.pipe(map(converterSections))),
                events$: changes$.pipe(map(change => recorded('change', change))),
            };
        },
    },
    {
        id: 'menu',
        title: 'Menus',
        group: 'Controls',
        description:
            "A program's own actions, as data, in a ⋯ in its window's title strip: grouped, each with a glyph, the destructive ones last in a group of their own and asking once before they act, hanging inside the window and opening above it when below would run off the screen. The formula editor and the note use it; the window's own state and program menus hang in the frame by the same rules, and menus that belong to no window (a select's list, the launcher's categories) are the glass.",
        elements: ['hks-menu', 'MenuGroup', 'MenuItem', 'ordered', 'reduceMenu'],
        variants: [
            { id: 'formula', title: 'Formula, saved' },
            { id: 'builtin', title: 'Formula, built in' },
            { id: 'note', title: 'Note' },
        ],
        controls: [],
        defaults,
        height: 320,
        action: null,
        code: "const menu = new HksMenu();\n// A program hands it to its window: return { element, actions: menu, run$ }.\nconst lifetime$ = menu.connect$(of([{ id: 'note', items: [{ id: 'delete', label: 'Delete this note', glyph: ICONS.remove, destructive: true }] }]), 'note actions');\nconst picks$ = menu.picks$; // { id, text }",
        create: ({ variant }) => {
            const element = new HksMenu();
            element.style.marginInlineStart = '12rem';
            const groups =
                variant === 'note'
                    ? noteMenu('note-1')
                    : formulaMenu({ deletable: variant === 'formula', copied: false });
            return {
                element,
                run$: element.connect$(of(groups), `${variant} actions`),
                events$: element.picks$.pipe(map(pick => recorded('pick', pick))),
            };
        },
    },
];
