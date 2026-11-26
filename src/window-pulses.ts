import { defer, fromEvent, type Observable } from 'rxjs';
import { filter, map, tap } from 'rxjs/operators';
import type { Named } from './graph/app-state.graph.ts';
import type { ProcessId } from './protocol.ts';

const PULSE = 'hakase:pulse';

export type WindowPulse = {
    readonly stream: string;
    readonly value: unknown;
    readonly by: object;
};

// An announcement, not a stream the inspector subscribes: subscribing a window's streams again would run them twice.
export const pulsedBy =
    (process: ProcessId): Named =>
    (name, source) =>
        defer(() => {
            const by = {};

            return source.pipe(
                tap(value => {
                    window.dispatchEvent(
                        new CustomEvent(PULSE, {
                            detail: { stream: `${process} ${name}`, value, by },
                        }),
                    );
                }),
            );
        });

const pulseOf = (event: Event): WindowPulse | null => {
    const detail: unknown = event instanceof CustomEvent ? event.detail : null;

    return typeof detail === 'object' &&
        detail !== null &&
        'stream' in detail &&
        typeof detail.stream === 'string' &&
        'by' in detail &&
        typeof detail.by === 'object' &&
        detail.by !== null
        ? { stream: detail.stream, value: 'value' in detail ? detail.value : null, by: detail.by }
        : null;
};

export const windowPulses$: Observable<WindowPulse> = defer(() =>
    fromEvent(window, PULSE).pipe(
        map(pulseOf),
        filter(pulse => pulse !== null),
    ),
);
