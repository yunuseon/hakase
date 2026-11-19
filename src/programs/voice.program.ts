import { declarations } from '../declarations.ts';
import { merge } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map, mergeMap, shareReplay } from 'rxjs/operators';
import { voiceCommandOf, voiceSections } from '../components/voice/voice-controls.ts';
import { notesOf, type Heard } from '../model/voice.ts';
import type { Program } from '../program.ts';
import type { AppInput } from '../protocol.ts';

export const voiceProgram = {
    ...declarations.voice,
    size: { width: 400, height: 360 },
    minimum: { width: 220, height: 180 },
    launch: async () => {
        const [{ HksVoice }, { HksProperties }] = await Promise.all([
            import('../components/voice/voice.component.ts'),
            import('../shared/ui/properties.component.ts'),
        ]);
        const voice = new HksVoice();
        const properties = new HksProperties();
        properties.slot = 'controls';
        voice.append(properties);

        return {
            element: voice,
            run$: ({ sounding$, playhead$, listening$ }) => {
                // Together: notes derived beside the sounding would reach the connect below by two paths.
                const heard$ = sounding$.pipe(
                    map((sounding): Heard => ({ sounding, notes: notesOf(sounding) })),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                return merge(
                    voice.connect$(heard$, playhead$, listening$).pipe(ignoreElements()),
                    properties
                        .connect$(
                            sounding$.pipe(
                                map(({ voice: document }) => document),
                                distinctUntilChanged(),
                                map(voiceSections),
                            ),
                        )
                        .pipe(ignoreElements()),
                    properties.changes$.pipe(
                        mergeMap(change =>
                            voiceCommandOf(change).map((command): AppInput => ({
                                kind: 'voice',
                                command,
                            })),
                        ),
                    ),
                    voice.changes$.pipe(
                        map((event): AppInput =>
                            event.kind === 'listen'
                                ? { kind: 'listen' }
                                : { kind: 'voice', command: event.command },
                        ),
                    ),
                );
            },
        };
    },
} satisfies Program;
