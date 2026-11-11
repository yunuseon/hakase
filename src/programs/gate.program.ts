import { combineLatest, merge } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map } from 'rxjs/operators';
import { tickAt } from '../circuit.ts';
import { HksGate } from '../components/gate/gate.component.ts';
import type { GateView } from '../components/gate/gate.ts';
import { GATES, type Bit, type GateKind } from '../gates.ts';
import { gateInputs, playbackInput } from '../inputs.ts';
import type { AppInput, Program } from '../program.ts';

export const gateProgram = <K extends GateKind>(kind: K) => {
    const spec = GATES[kind];

    return {
        id: kind,
        inputs: { playback: playbackInput, ...gateInputs(kind) },
        title: spec.title.toLowerCase(),
        category: 'logic',
        icon: spec.icon,
        size: { width: 160, height: 176 },
        minimum: { width: 140, height: 160 },
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
                        map(([document, bits, tick]): GateView => ({
                            icon: spec.icon,
                            summary: spec.summary,
                            bit: bits[tick] === 1 ? 1 : 0,
                            tick,
                            row: [...bits].map((bit): Bit => (bit === 1 ? 1 : 0)),
                            toggle: kind === 'switch' || kind === 'const',
                            steps: kind === 'pattern' ? document.steps : null,
                            threshold: kind === 'compare' ? document.threshold : null,
                            name: kind === 'pin-in' || kind === 'pin-out' ? document.name : null,
                        })),
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
