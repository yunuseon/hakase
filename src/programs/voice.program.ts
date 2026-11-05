import { combineLatest, EMPTY, merge } from 'rxjs';
import {
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
import { frameOf } from '../shared/schedule.ts';
import { HksVoice } from '../components/voice/voice.component.ts';
import {
    notesOf,
    plannedNotes,
    playedAt,
    unplanned,
    type Heard,
    type Planning,
} from '../components/voice/voice.ts';
import { playbackInput, voiceInputs } from '../inputs.ts';
import type { AppInput, Program } from '../program.ts';

export const voiceProgram = {
    id: 'voice',
    inputs: { playback: playbackInput, ...voiceInputs },
    title: 'voice',
    category: 'make',
    icon: 'M9 18 V6 L19 4 V16 M9 18 A2.5 2.5 0 1 1 4 18 A2.5 2.5 0 1 1 9 18 M19 16 A2.5 2.5 0 1 1 14 16 A2.5 2.5 0 1 1 19 16',
    size: { width: 400, height: 360 },
    minimum: { width: 300, height: 300 },
    launch: () => {
        const voice = new HksVoice();

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
