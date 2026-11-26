import { declarations } from '../declarations.ts';
import { merge } from 'rxjs';
import { ignoreElements, map, tap, withLatestFrom } from 'rxjs/operators';
import { forAgents } from '../diagnostics.ts';
import type { Program } from '../program.ts';
import { streamsViewOf } from '../streams-view.ts';

export const streamsProgram = {
    ...declarations.streams,
    size: { width: 520, height: 420 },
    minimum: { width: 200, height: 140 },
    launch: async () => {
        const { HksStreams } = await import('../components/streams/streams.component.ts');
        const streams = new HksStreams();

        return {
            element: streams,
            run$: ({ report$ }) =>
                merge(
                    streams.connect$(report$.pipe(map(streamsViewOf))),
                    streams.copies$.pipe(
                        withLatestFrom(report$),
                        map(([, report]) => JSON.stringify(forAgents(report), null, 1)),
                        tap(text => void navigator.clipboard.writeText(text)),
                    ),
                ).pipe(ignoreElements()),
        };
    },
} satisfies Program;
