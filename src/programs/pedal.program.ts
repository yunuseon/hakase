import { combineLatest, merge } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map } from 'rxjs/operators';
import { HksImageView } from '../components/image-view/image-view.component.ts';
import { HksPedal } from '../components/pedal/pedal.component.ts';
import type { PedalView } from '../components/pedal/pedal.ts';
import { momentOf$, viewRatio$ } from '../engine/moment.ts';
import { view$ } from '../engine/view.ts';
import { pedalInputs, playbackInput } from '../inputs.ts';
import { PEDALS, valueOf, type PedalKind } from '../pedals.ts';
import type { AppInput, Program } from '../program.ts';
import { shownOf } from './output.program.ts';

// Every pedal is this program over its row of the PEDALS table: a new pedal is one entry and one shader.
export const pedalProgram = <K extends PedalKind>(kind: K) => {
    const spec = PEDALS[kind];

    return {
        id: kind,
        inputs: { playback: playbackInput, ...pedalInputs(kind) },
        title: spec.title.toLowerCase(),
        category: 'make',
        icon: spec.icon,
        size: { width: 300, height: 380 },
        minimum: { width: 200, height: 280 },
        launch: () => {
            const view = new HksImageView();
            const pedal = new HksPedal();
            pedal.slot = 'controls';
            view.append(pedal);

            return {
                element: view,
                run$: ({ image$, pedal$, linkedDriver$, linkedName$, clock$, zoom$ }) => {
                    const driven$ = combineLatest(
                        spec.knobs.map(({ name }) =>
                            linkedDriver$(name).pipe(
                                map(driver => driver !== null),
                                distinctUntilChanged(),
                            ),
                        ),
                    );
                    const inputs$ = combineLatest(
                        spec.inputs.map(name =>
                            linkedName$(name).pipe(map(from => ({ name, from }))),
                        ),
                    );
                    const pedalView$ = combineLatest([pedal$, driven$, inputs$]).pipe(
                        map(([document, driven, inputs]): PedalView => ({
                            summary: spec.summary,
                            knobs: spec.knobs.map((knob, index) => ({
                                ...knob,
                                value: valueOf(document, knob.name),
                                driven: driven[index] ?? false,
                            })),
                            choices: spec.choices,
                            choice: document.choice,
                            inputs,
                        })),
                    );

                    return merge(
                        view
                            .connect$(
                                view$(
                                    image$,
                                    momentOf$(clock$, view.sizes$, viewRatio$(zoom$)),
                                ).pipe(
                                    map(
                                        shownOf(
                                            'Nothing plugged in. In state mode, wire a picture into in.',
                                        ),
                                    ),
                                ),
                            )
                            .pipe(ignoreElements()),
                        pedal.connect$(pedalView$).pipe(ignoreElements()),
                        pedal.changes$.pipe(
                            map((command): AppInput => ({ kind: 'pedal', command })),
                        ),
                    );
                },
            };
        },
    } satisfies Program<K>;
};
