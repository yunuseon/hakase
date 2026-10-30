import { animationFrames, defer, EMPTY, merge, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    map,
    pairwise,
    scan,
    shareReplay,
    startWith,
    switchMap,
    withLatestFrom,
} from 'rxjs/operators';
import { wrap01 } from '../lib/math.ts';

export type TransportCommand = 'toggle' | 'stop' | 'loop';

export const defaultDuration = 8;

export const elapsedLabel = (at: number, duration: number): string => (at * duration).toFixed(1);

export const parseDuration = (text: string): number | null => {
    const seconds = Math.round(Number(text) * 10) / 10;

    return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 600) : null;
};

export type Transport = {
    readonly at: number;
    readonly playing: boolean;
    readonly looping: boolean;
};

export const initialTransport: Transport = { at: 0, playing: false, looping: true };

type TransportAction =
    | { readonly kind: 'command'; readonly command: TransportCommand }
    | { readonly kind: 'seek'; readonly at: number }
    | { readonly kind: 'advance'; readonly ms: number; readonly duration: number };

// The buttons cannot know which they mean, so the fold owns every flip.
const command = (transport: Transport, command: TransportCommand): Transport => {
    switch (command) {
        case 'toggle':
            return transport.playing
                ? { ...transport, playing: false }
                : { ...transport, playing: true, at: transport.at >= 1 ? 0 : transport.at };
        case 'stop':
            return { ...transport, playing: false, at: 0 };
        case 'loop':
            return { ...transport, looping: !transport.looping };
    }
};

const advance = (transport: Transport, ms: number, duration: number): Transport => {
    if (duration === 0) {
        return transport;
    }

    const at = transport.at + ms / (duration * 1000);

    if (transport.looping) {
        return { ...transport, at: wrap01(at) };
    }

    return at >= 1 ? { ...transport, at: 1, playing: false } : { ...transport, at };
};

export const reduceTransport = (transport: Transport, action: TransportAction): Transport => {
    switch (action.kind) {
        case 'command':
            return command(transport, action.command);
        case 'seek':
            return { ...transport, at: action.at };
        case 'advance':
            return advance(transport, action.ms, action.duration);
    }
};

export const createTransport$ = (
    scrubs$: Observable<number>,
    commands$: Observable<TransportCommand>,
    duration$: Observable<number>,
    initial: Transport = initialTransport,
): Observable<Transport> => {
    const transport$: Observable<Transport> = merge(
        scrubs$.pipe(map((at): TransportAction => ({ kind: 'seek', at }))),
        commands$.pipe(map((command): TransportAction => ({ kind: 'command', command }))),
        // defer: reaching the end without a loop pauses, so the frames are gated by this fold.
        defer(() => transport$).pipe(
            map(({ playing }) => playing),
            distinctUntilChanged(),
            // Deltas, not elapsed: pausing then playing must resume, not jump.
            switchMap(playing =>
                playing
                    ? animationFrames().pipe(
                          pairwise(),
                          map(([previous, frame]) => frame.elapsed - previous.elapsed),
                      )
                    : EMPTY,
            ),
            withLatestFrom(duration$),
            map(([ms, duration]): TransportAction => ({ kind: 'advance', ms, duration })),
        ),
    ).pipe(
        scan(reduceTransport, initial),
        startWith(initial),
        // Not refCount: closing the last timeline must not rewind or unloop the clock.
        shareReplay({ bufferSize: 1, refCount: false }),
    );

    return transport$;
};
