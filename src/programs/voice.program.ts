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
import {
    applyLevel,
    voiceGraph$,
    type Played,
    type VoiceGraph,
} from '../components/voice/audio/graph.ts';
import { strike } from '../components/voice/audio/strike.ts';
import { INSTRUMENTS, type Instrument } from '../components/voice/instruments.ts';
import { scheduled, unscheduled, type Schedule, type Strike } from '../shared/schedule.ts';
import { HksVoice, type Heard } from '../components/voice/voice.component.ts';
import { frequencyOf, levelAt, notesOf, type Note } from '../components/voice/voice.ts';
import { playbackInput, voiceInputs } from '../inputs.ts';
import type { AppInput, Program } from '../program.ts';

type Scheduling = {
    readonly schedule: Schedule;
    readonly strikes: readonly (Strike<Note> & {
        readonly instrument: Instrument;
        readonly frequency: number;
    })[];
};

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
            run$: ({ sounding$, playhead$, playing$, duration$ }) => {
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
                const played$ = combineLatest([heard$, playhead$, duration$, playing$]).pipe(
                    map(([{ sounding, notes }, t, seconds, playing]): Played => {
                        const level = levelAt(sounding, notes, t, seconds);

                        return {
                            level: { ...level, gain: playing ? level.gain : 0 },
                            shape: sounding.voice.shape,
                            glide: sounding.voice.glide,
                            synth: sounding.voice.instrument === 'synth',
                        };
                    }),
                );
                const frames$ = combineLatest([heard$, playhead$, duration$, playing$]);
                // Ahead of the playhead on the audio clock: struck at the frame rate, a note would land up to a frame late.
                const struck$ = (graph: VoiceGraph) =>
                    frames$.pipe(
                        scan(
                            (
                                { schedule }: Scheduling,
                                [heard, t, seconds, playing],
                            ): Scheduling => {
                                const { instrument, root } = heard.sounding.voice;

                                if (instrument === 'synth') {
                                    return { schedule: unscheduled, strikes: [] };
                                }

                                const next = scheduled(
                                    schedule,
                                    { t, now: graph.context.currentTime, seconds, playing },
                                    heard.notes,
                                );

                                return {
                                    schedule: next.schedule,
                                    strikes: next.strikes.map(planned => ({
                                        ...planned,
                                        instrument: INSTRUMENTS[instrument],
                                        frequency: frequencyOf(root + planned.span.semitones),
                                    })),
                                };
                            },
                            { schedule: unscheduled, strikes: [] },
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
