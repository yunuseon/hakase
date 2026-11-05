import type { Observable } from 'rxjs';
import { merge } from 'rxjs';
import { filter, map, pairwise, startWith, tap } from 'rxjs/operators';
import { endedPlans, finished, type Plan, type Timers } from './components/focus/focus.ts';

const NOTES = [660, 880, 990];

const play = (): void => {
    const context = new AudioContext();
    const start = context.currentTime;

    NOTES.forEach((frequency, index) => {
        const tone = context.createOscillator();
        const gain = context.createGain();
        const at = start + index * 0.18;
        tone.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.6);
        tone.connect(gain).connect(context.destination);
        tone.start(at);
        tone.stop(at + 0.65);

        if (index === NOTES.length - 1) {
            tone.addEventListener('ended', () => void context.close());
        }
    });
};

export const chime$ = (
    timers$: Observable<Timers>,
    plans$: Observable<ReadonlyMap<string, Plan>>,
): Observable<void> =>
    merge(
        timers$.pipe(
            pairwise(),
            filter(([before, after]) => finished(before, after) > 0),
        ),
        plans$.pipe(
            startWith(new Map<string, Plan>()),
            pairwise(),
            filter(([before, after]) => endedPlans(before, after) > 0),
        ),
    ).pipe(
        tap(play),
        map(() => undefined),
    );
