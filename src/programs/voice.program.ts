import { declarations } from '../declarations.ts';
import { combineLatest, EMPTY, merge } from 'rxjs';
import {
    distinctUntilChanged,
    ignoreElements,
    map,
    mergeMap,
    scan,
    share,
    shareReplay,
    startWith,
    switchMap,
    tap,
} from 'rxjs/operators';
import { applyLevel, voiceGraph$, type VoiceGraph } from '../components/voice/audio/graph.ts';
import { strike } from '../components/voice/audio/strike.ts';
import { voiceCommandOf, voiceSections } from '../components/voice/voice-controls.ts';
import { frameOf } from '../shared/schedule.ts';
import {
    notesOf,
    plannedNotes,
    playedAt,
    unplanned,
    type Heard,
    type Planning,
} from '../model/voice.ts';
import type { Program } from '../program.ts';
import type { AppInput } from '../protocol.ts';

export const voiceProgram = {
    ...declarations.voice,
    size: { width: 400, height: 360 },
    minimum: { width: 220, height: 180 },
    audible: true,
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
            run$: ({ sounding$, playhead$, clock$ }) => {
                // Together: notes derived beside the sounding would reach the combineLatest below by two paths.
                const heard$ = sounding$.pipe(
                    map((sounding): Heard => ({ sounding, notes: notesOf(sounding) })),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const events$ = voice.changes$.pipe(share());
                const listening$ = events$.pipe(
                    scan((on, event) => (event.kind === 'listen' ? !on : on), false),
                    startWith(false),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const frames$ = combineLatest([heard$, clock$]);
                const played$ = frames$.pipe(
                    map(([heard, { at, duration, playing }]) =>
                        playedAt(heard, at, duration, playing),
                    ),
                );
                // Ahead of the playhead on the audio clock: struck at the frame rate, a note would land up to a frame late.
                const struck$ = (graph: VoiceGraph) =>
                    frames$.pipe(
                        // Stamped before the fold, so the fold reads nothing but its arguments.
                        map(([heard, clock]) => ({
                            heard,
                            frame: frameOf(clock, graph.context.currentTime),
                        })),
                        scan(
                            (planning: Planning, { heard, frame }) =>
                                plannedNotes(planning, heard, frame),
                            unplanned,
                        ),
                        mergeMap(({ strikes }) => strikes),
                        tap(({ instrument, frequency, at, held }) => {
                            strike(graph.context, graph.filter, instrument, frequency, at, held);
                        }),
                    );
                const sound$ = listening$.pipe(
                    switchMap(on =>
                        on
                            ? voiceGraph$.pipe(
                                  switchMap(graph =>
                                      merge(
                                          played$.pipe(
                                              tap(played => {
                                                  applyLevel(graph, played);
                                              }),
                                          ),
                                          struck$(graph),
                                      ),
                                  ),
                              )
                            : EMPTY,
                    ),
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
                    sound$.pipe(ignoreElements()),
                    events$.pipe(
                        mergeMap((event): AppInput[] =>
                            event.kind === 'command'
                                ? [{ kind: 'voice', command: event.command }]
                                : [],
                        ),
                    ),
                );
            },
        };
    },
} satisfies Program;
