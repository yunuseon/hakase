import { combineLatest, merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { HksConverter } from '../components/converter/converter.component.ts';
import { converterView } from '../components/converter/converter.ts';
import { CONVERTERS, type ConverterKind } from '../converters.ts';
import { converterInputs, playbackInput } from '../inputs.ts';
import type { AppInput, Program } from '../program.ts';
import { driverAt } from '../shared/curve.ts';

const EMPTY_TEXT: Readonly<Record<ConverterKind, string>> = {
    timing: 'Plug an agenda into in: drag a wire in state mode (hold W), or pick one in the state menu.',
    envelope:
        'Plug a voice or drum machine into in: drag a wire in state mode (hold W), or pick one in the state menu.',
    kit: 'Plug a drum machine into in: drag a wire in state mode (hold W), or pick one in the state menu.',
    phase: 'Plug a focus timer into in: drag a wire in state mode (hold W), or pick one in the state menu.',
    done: 'Plug a ticket list into in: drag a wire in state mode (hold W), or pick one in the state menu.',
};

export const converterProgram = <K extends ConverterKind>(kind: K) => {
    const spec = CONVERTERS[kind];

    return {
        id: kind,
        inputs: { playback: playbackInput, ...converterInputs(kind) },
        title: spec.title.toLowerCase(),
        category: 'convert',
        icon: spec.icon,
        size: spec.size,
        minimum: { width: 220, height: 180 },
        launch: () => {
            const converter = new HksConverter();

            return {
                element: converter,
                run$: ({ converter$, converted$, playhead$ }) =>
                    merge(
                        converter
                            .connect$(
                                combineLatest([converter$, converted$, playhead$]).pipe(
                                    map(([document, driver, t]) =>
                                        converterView({
                                            summary: spec.summary,
                                            choices: spec.choices,
                                            choice: document.choice,
                                            samples:
                                                driver !== null && 'samples' in driver
                                                    ? driver.samples
                                                    : null,
                                            value: driver === null ? null : driverAt(driver, t),
                                            t,
                                            empty: EMPTY_TEXT[kind],
                                        }),
                                    ),
                                ),
                            )
                            .pipe(ignoreElements()),
                        converter.choices$.pipe(
                            map((choice): AppInput => ({
                                kind: 'converter',
                                command: { kind: 'choose', choice },
                            })),
                        ),
                    ),
            };
        },
    } satisfies Program<K>;
};
