import { combineLatest, type Observable } from 'rxjs';
import { distinctUntilChanged, map, shareReplay, withLatestFrom } from 'rxjs/operators';
import { sameStrips, stripsOf, type Strip } from '../mix.ts';
import { hitsOf, kitCurve, type Hit, type Kit } from '../model/drums.ts';
import { notesOf, voiceCurve, type Heard } from '../model/voice.ts';
import { curveAt, type Curve } from '../shared/curve.ts';
import { secondsOf, type Clock } from '../shared/playhead.ts';
import type { Levels, Pace } from './levels.graph.ts';
import type { Projections } from './projections.graph.ts';
import type { Timekeeping } from './timekeeping.graph.ts';

type Reads = Pick<Projections, 'structure$'> &
    Pick<Timekeeping, 'playbackIn'> &
    Pick<Levels, 'soundingIn' | 'kitIn' | 'voiceIn' | 'drumsIn'>;

export type Played =
    | { readonly kind: 'voice'; readonly heard: Heard; readonly curve: Curve }
    | {
          readonly kind: 'drums';
          readonly kit: Kit;
          readonly hits: readonly Hit[];
          readonly curve: Curve;
      };

export const mixOf = ({ structure$, playbackIn, soundingIn, kitIn, voiceIn, drumsIn }: Reads) => {
    const strips$ = structure$.pipe(
        map(stripsOf),
        distinctUntilChanged(sameStrips),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const clockIn = (strip: Strip): Observable<Clock> => playbackIn(strip.clock);

    const paceIn = (strip: Strip): Observable<Pace> =>
        clockIn(strip).pipe(
            map((clock): Pace => ({ seconds: secondsOf(clock), ticks: clock.ticks })),
            distinctUntilChanged((a, b) => a.seconds === b.seconds && a.ticks === b.ticks),
        );

    // Notes and hits travel with what they were made from, or a change would reach a reader by two paths.
    const playedIn = (strip: Strip): Observable<Played> => {
        const pace$ = paceIn(strip).pipe(shareReplay({ bufferSize: 1, refCount: true }));

        return strip.program === 'voice'
            ? soundingIn(strip.store, pace$).pipe(
                  withLatestFrom(pace$),
                  map(([sounding, { seconds }]): Played => ({
                      kind: 'voice',
                      heard: { sounding, notes: notesOf(sounding) },
                      curve: voiceCurve(sounding, seconds),
                  })),
              )
            : kitIn(strip.store, pace$).pipe(
                  withLatestFrom(pace$),
                  map(([kit, { seconds }]): Played => ({
                      kind: 'drums',
                      kit,
                      hits: hitsOf(kit.drums),
                      curve: kitCurve(kit, seconds),
                  })),
              );
    };

    const mutedIn = (strip: Strip): Observable<boolean> =>
        (strip.program === 'voice'
            ? voiceIn(strip.store).pipe(map(({ muted }) => muted))
            : drumsIn(strip.store).pipe(map(({ muted }) => muted))
        ).pipe(distinctUntilChanged());

    const meterIn = (strip: Strip): Observable<number> =>
        combineLatest([playedIn(strip), clockIn(strip)]).pipe(
            map(([played, { at, playing }]) => (playing ? curveAt(played.curve, at) : 0)),
            distinctUntilChanged(),
        );

    return {
        strips$,
        clockIn,
        playedIn,
        mutedIn,
        meterIn,
    };
};

export type Mix = ReturnType<typeof mixOf>;
