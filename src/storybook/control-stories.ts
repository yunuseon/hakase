import { combineLatest, EMPTY, merge, of } from 'rxjs';
import { map, scan, share, shareReplay, startWith, tap } from 'rxjs/operators';
import { HksSelect } from '../shared/select/select.component.ts';
import { renderOptions } from '../shared/select/options.component.ts';
import { HksSearchPicker } from '../components/search-picker/search-picker.component.ts';
import { HksProgressBar } from '../components/progress-bar/progress-bar.component.ts';
import { HksLinearSlider } from '../components/slider/linear/linear-slider.component.ts';
import { HksCircularSlider } from '../components/slider/circular/circular-slider.component.ts';
import { HksVoice } from '../components/voice/voice.component.ts';
import { defaultVoice, notesOf, reduceVoice, soundingOf } from '../components/voice/voice.ts';
import { HksDrums } from '../components/drums/drums.component.ts';
import { defaultDrums, reduceDrums } from '../components/drums/drums.ts';
import { defaults, recorded, type Story } from './story.ts';

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
        code: 'const voice = new HksVoice();\nconst lifetime$ = voice.connect$(heard$, position$, listening$);\nconst requests$ = voice.changes$;',
        create: ({ args$, variant }) => {
            const element = new HksVoice();
            if (variant === 'compact') {
                element.style.inlineSize = 'min(100%, 240px)';
                element.style.blockSize = '300px';
            }
            const events$ = element.changes$.pipe(share());
            const heard$ = events$.pipe(
                scan(
                    (voice, event) =>
                        event.kind === 'command' ? reduceVoice(voice, event.command) : voice,
                    defaultVoice,
                ),
                startWith(defaultVoice),
                map(voice => soundingOf(voice, new Map())),
                map(sounding => ({ sounding, notes: notesOf(sounding) })),
            );
            return {
                element,
                run$: element.connect$(
                    heard$,
                    args$.pipe(map(args => args.value / 100)),
                    of(false),
                ),
                events$: events$.pipe(map(event => recorded(event.kind, event))),
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
        code: 'const drums = new HksDrums();\nconst lifetime$ = drums.connect$(pattern$, position$, listening$);\nconst requests$ = drums.changes$;',
        create: ({ args$, variant }) => {
            const element = new HksDrums();
            if (variant === 'compact') {
                element.style.inlineSize = 'min(100%, 240px)';
                element.style.blockSize = '300px';
            }
            const events$ = element.changes$.pipe(share());
            const pattern$ = events$.pipe(
                scan(
                    (pattern, event) =>
                        event.kind === 'command' ? reduceDrums(pattern, event.command) : pattern,
                    defaultDrums,
                ),
                startWith(defaultDrums),
            );
            return {
                element,
                run$: element.connect$(
                    pattern$,
                    args$.pipe(map(args => args.value / 100)),
                    of(false),
                ),
                events$: events$.pipe(map(event => recorded(event.kind, event))),
            };
        },
    },
];
