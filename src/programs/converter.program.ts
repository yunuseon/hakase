import { combineLatest, merge } from 'rxjs';
import { ignoreElements, map, mergeMap } from 'rxjs/operators';
import { HksConverter } from '../components/converter/converter.component.ts';
import { converterView } from '../components/converter/converter.ts';
import { converterTitle, CONVERTERS, isShapeField, type ConverterKind } from '../converters.ts';
import { converterInputs, playbackInput } from '../inputs.ts';
import { CONVERSIONS } from '../port-types.ts';
import type { AppInput, Program } from '../program.ts';
import { curveOf, driverAt } from '../shared/curve.ts';

const emptyText = (kind: ConverterKind) => {
    const { takes } = CONVERTERS[kind];
    const types = [takes, ...CONVERSIONS.filter(({ to }) => to === takes).map(({ from }) => from)];
    const sources = converterInputs(kind)['in']?.sources ?? [];
    const named =
        sources.length > 0 && sources.length <= 3
            ? ` (${sources.map(({ title }) => title).join(', ')})`
            : '';

    return `Nothing plugged into in. It takes a ${types.join(' or a ')}${named}. Drag a wire in state mode (hold W), or pick one in the state menu.`;
};

export const converterProgram = <K extends ConverterKind>(kind: K) => {
    const spec = CONVERTERS[kind];

    return {
        id: kind,
        inputs: { playback: playbackInput, ...converterInputs(kind) },
        title: converterTitle(kind),
        category: 'convert',
        icon: spec.icon,
        size: spec.size,
        minimum: { width: 220, height: 180 },
        launch: () => {
            const converter = new HksConverter();

            return {
                element: converter,
                run$: ({ conversion$, playhead$ }) =>
                    merge(
                        converter
                            .connect$(
                                combineLatest([
                                    conversion$.pipe(
                                        map(({ converter: document, driver }) => ({
                                            document,
                                            driver,
                                            samples:
                                                driver === null
                                                    ? null
                                                    : 'samples' in driver
                                                      ? driver.samples
                                                      : curveOf(t => driverAt(driver, t)).samples,
                                        })),
                                    ),
                                    playhead$,
                                ]).pipe(
                                    map(([{ document, driver, samples }, t]) =>
                                        converterView({
                                            summary: spec.summary,
                                            choices: spec.choices,
                                            choice: document.choice,
                                            samples,
                                            value: driver === null ? null : driverAt(driver, t),
                                            t,
                                            empty: emptyText(kind),
                                            shape: spec.makes === 'level' ? document.shape : null,
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
                        converter.shapes$.pipe(
                            mergeMap(({ field, value }): AppInput[] =>
                                isShapeField(field)
                                    ? [
                                          {
                                              kind: 'converter',
                                              command: { kind: 'shape', field, value },
                                          },
                                      ]
                                    : [],
                            ),
                        ),
                    ),
            };
        },
    } satisfies Program<K>;
};
