import { converterDeclaration } from '../declarations.ts';
import { combineLatest, merge } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map, mergeMap } from 'rxjs/operators';
import { converterSections, converterView } from '../components/converter/converter.ts';
import { CONVERTERS, isBitField, isShapeField, type ConverterKind } from '../converters.ts';
import { converterInputs } from '../inputs.ts';
import { CONVERSIONS } from '../port-types.ts';
import type { Program } from '../program.ts';
import type { AppInput } from '../protocol.ts';
import { curveOf } from '../shared/curve.ts';
import { fieldOf, numberOf, textOf, type PropertyChange } from '../shared/properties.ts';
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

const converterInputsOf = (change: PropertyChange): AppInput[] => {
    const text = textOf(change);
    const value = numberOf(change);
    const shape = fieldOf(change.id, 'shape');
    const bits = fieldOf(change.id, 'bits');

    return change.id === 'item' && text !== null
        ? [{ kind: 'converter', command: { kind: 'item', item: text === '' ? null : text } }]
        : change.id === 'reading' && text !== null
          ? [{ kind: 'converter', command: { kind: 'choose', choice: text } }]
          : shape !== null && isShapeField(shape) && value !== null
            ? [{ kind: 'converter', command: { kind: 'shape', field: shape, value } }]
            : bits !== null && isBitField(bits) && value !== null
              ? [{ kind: 'converter', command: { kind: 'bits', field: bits, value } }]
              : [];
};

export const converterProgram = <K extends ConverterKind>(kind: K) => {
    const spec = CONVERTERS[kind];

    return {
        ...converterDeclaration(kind),
        size: spec.size,
        minimum: { width: 220, height: 180 },
        launch: async () => {
            const [{ HksConverter }, { HksProperties }] = await Promise.all([
                import('../components/converter/converter.component.ts'),
                import('../shared/ui/properties.component.ts'),
            ]);
            const converter = new HksConverter();
            const properties = new HksProperties();
            properties.slot = 'controls';
            converter.append(properties);

            return {
                element: converter,
                run$: ({ conversion$, playhead$ }) =>
                    merge(
                        converter
                            .connect$(
                                combineLatest([
                                    conversion$.pipe(
                                        map(({ driver }) => ({
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
                                    map(([{ driver, samples }, t]) =>
                                        converterView({
                                            summary: spec.summary,
                                            samples,
                                            value: driver === null ? null : driverAt(driver, t),
                                            t,
                                            empty: emptyText(kind),
                                        }),
                                    ),
                                ),
                            )
                            .pipe(ignoreElements()),
                        properties
                            .connect$(
                                conversion$.pipe(
                                    distinctUntilChanged(
                                        (a, b) =>
                                            a.converter === b.converter && a.items === b.items,
                                    ),
                                    map(({ converter: document, items }) =>
                                        converterSections({
                                            choices: spec.choices,
                                            choice: document.choice,
                                            items,
                                            item: document.item ?? items[0]?.id ?? '',
                                            shape: spec.makes === 'level' ? document.shape : null,
                                            bits: spec.makes === 'bit' ? document.bits : null,
                                            thresholded: spec.takes === 'level',
                                        }),
                                    ),
                                ),
                            )
                            .pipe(ignoreElements()),
                        properties.changes$.pipe(mergeMap(converterInputsOf)),
                    ),
            };
        },
    } satisfies Program<K>;
};
