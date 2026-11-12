import { combineLatest, merge } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map } from 'rxjs/operators';
import { tickAt } from '../circuit.ts';
import { HksGate } from '../components/gate/gate.component.ts';
import { gateView } from '../components/gate/gate.ts';
import { GATES, type GateKind } from '../gates.ts';
import { gateInputs, loosePlaybackInput } from '../inputs.ts';
import type { AppInput, Program } from '../program.ts';

export const gateProgram = <K extends GateKind>(kind: K) => {
    const spec = GATES[kind];

    return {
        id: kind,
        inputs: { playback: loosePlaybackInput, ...gateInputs(kind) },
        title: spec.title.toLowerCase(),
        category: 'logic',
        icon: spec.icon,
        size: spec.size,
        minimum: { width: Math.min(spec.size.width, 104), height: spec.size.height },
        launch: () => {
            const gate = new HksGate();

            return {
                element: gate,
                run$: ({ gate$, bits$, playhead$ }) => {
                    const tick$ = combineLatest([playhead$, bits$]).pipe(
                        map(([t, bits]) => tickAt(t, bits.length)),
                        distinctUntilChanged(),
                    );
                    const view$ = combineLatest([gate$, bits$, tick$]).pipe(
                        map(([document, bits, tick]) => gateView(kind, document, bits, tick)),
                    );

                    return merge(
                        gate.connect$(view$).pipe(ignoreElements()),
                        gate.changes$.pipe(map((command): AppInput => ({ kind: 'gate', command }))),
                    );
                },
            };
        },
    } satisfies Program<K>;
};
