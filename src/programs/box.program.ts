import { combineLatest, merge } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map } from 'rxjs/operators';
import { tickAt } from '../circuit.ts';
import type { Pin } from '../boxes.ts';
import { HksBox } from '../components/box/box.component.ts';
import type { BoxView, PinView } from '../components/box/box.ts';
import type { Bit } from '../gates.ts';
import { loosePlaybackInput } from '../inputs.ts';
import type { AppInput, Program } from '../program.ts';

const pinView =
    (tick: number) =>
    ({ store, name, bits }: Pin): PinView => ({
        store,
        name,
        bit: bits[tick] === 1 ? 1 : 0,
        row: [...bits].map((bit): Bit => (bit === 1 ? 1 : 0)),
    });

export const boxProgram = {
    id: 'box',
    inputs: { playback: loosePlaybackInput },
    title: 'component',
    category: 'logic',
    icon: 'M4 6h16v12H4zM2 10h2M2 14h2M20 12h2M8 10h8M8 14h5',
    size: { width: 240, height: 192 },
    minimum: { width: 200, height: 150 },
    launch: () => {
        const box = new HksBox();

        return {
            element: box,
            run$: ({ box$, playhead$ }) => {
                const view$ = combineLatest([box$, playhead$]).pipe(
                    map(([reading, t]) => ({ reading, tick: tickAt(t, reading.ticks) })),
                    distinctUntilChanged((a, b) => a.reading === b.reading && a.tick === b.tick),
                    map(({ reading, tick }): BoxView => ({
                        name: reading.name,
                        tick,
                        inputs: reading.inputs.map(pinView(tick)),
                        outputs: reading.outputs.map(pinView(tick)),
                    })),
                );

                return merge(
                    box.connect$(view$).pipe(ignoreElements()),
                    box.changes$.pipe(
                        map((change): AppInput =>
                            change.kind === 'open'
                                ? { kind: 'unbox' }
                                : { kind: 'box', command: change },
                        ),
                    ),
                );
            },
        };
    },
} satisfies Program<'box'>;
