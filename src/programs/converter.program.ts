import { combineLatest, merge } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map, mergeMap } from 'rxjs/operators';
import { HksConverter } from '../components/converter/converter.component.ts';
import { converterView } from '../components/converter/converter.ts';
import {
    converterTitle,
    CONVERTERS,
    isBitField,
    isShapeField,
    type ConverterKind,
} from '../converters.ts';
import { converterInputs, playbackInput } from '../inputs.ts';
import { CONVERSIONS } from '../port-types.ts';
import type { AppInput, Program } from '../program.ts';
import { curveOf } from '../shared/curve.ts';
import { driverAt } from '../shared/signal.ts';

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
                                            bits: spec.makes === 'bit' ? document.bits : null,
                                            thresholded: spec.takes === 'level',
                                        }),
                                    ),
                                ),
                                conversion$.pipe(
                                    map(({ converter: document, items }) => ({
                                        items: items.map(({ id, title }) => ({
                                            value: id,
                                            label: title,
                                        })),
                                        item: document.item ?? items[0]?.id ?? '',
                                    })),
                                    distinctUntilChanged(
                                        (a, b) =>
                                            a.item === b.item &&
                                            a.items.length === b.items.length &&
                                            a.items.every(
                                                (each, index) =>
                                                    each.value === b.items[index]?.value &&
                                                    each.label === b.items[index]?.label,
                                            ),
                                    ),
                                ),
                            )
                            .pipe(ignoreElements()),
                        converter.items$.pipe(
                            map((item): AppInput => ({
                                kind: 'converter',
                                command: { kind: 'item', item: item === '' ? null : item },
                            })),
                        ),
                        converter.choices$.pipe(
                            map((choice): AppInput => ({
                                kind: 'converter',
                                command: { kind: 'choose', choice },
                            })),
                        ),
                        converter.shapes$.pipe(
                            mergeMap(({ group, field, value }): AppInput[] =>
                                group === 'shape' && isShapeField(field)
                                    ? [
                                          {
                                              kind: 'converter',
                                              command: { kind: 'shape', field, value },
                                          },
                                      ]
                                    : group === 'bits' && isBitField(field)
                                      ? [
                                            {
                                                kind: 'converter',
                                                command: { kind: 'bits', field, value },
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
