import type { Observable } from 'rxjs';
import { distinctUntilChanged, map, skip, tap } from 'rxjs/operators';
import type { Focus } from './components/focus/focus.ts';

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

export const chime$ = (focus$: Observable<Focus>): Observable<void> =>
    focus$.pipe(
        map(({ completed }) => completed),
        distinctUntilChanged(),
        // The restored count is not a phase ending now.
        skip(1),
        tap(play),
        map(() => undefined),
    );
