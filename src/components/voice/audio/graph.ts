import { Observable } from 'rxjs';
import { shareReplay, switchMap } from 'rxjs/operators';
import type { Level, Shape } from '../voice.ts';

// One context for every voice: a browser allows only a few, and it is closed when the last voice stops listening.
const context$ = new Observable<AudioContext>(subscriber => {
    const context = new AudioContext();

    void context.resume();
    subscriber.next(context);

    // Not at once: the voices' release fades are scheduled on this context, and closing cuts them off with a click.
    return () => {
        setTimeout(() => {
            void context.close();
        }, 250);
    };
}).pipe(shareReplay({ bufferSize: 1, refCount: true }));

export type VoiceGraph = {
    readonly context: AudioContext;
    readonly oscillator: OscillatorNode;
    readonly filter: BiquadFilterNode;
    readonly gain: GainNode;
    readonly panner: StereoPannerNode;
};

const HEADROOM = 0.3;
const RELEASE = 0.02;

// Subscribe inside a user's click: a context made outside a gesture starts suspended and stays silent.
export const voiceGraph$ = context$.pipe(
    switchMap(
        context =>
            new Observable<VoiceGraph>(subscriber => {
                const oscillator = context.createOscillator();
                const filter = context.createBiquadFilter();
                const gain = context.createGain();
                const panner = context.createStereoPanner();

                filter.type = 'lowpass';
                filter.Q.value = 0.7;
                gain.gain.value = 0;
                oscillator
                    .connect(filter)
                    .connect(gain)
                    .connect(panner)
                    .connect(context.destination);
                oscillator.start();
                subscriber.next({ context, oscillator, filter, gain, panner });

                return () => {
                    const now = context.currentTime;

                    gain.gain.cancelScheduledValues(now);
                    gain.gain.setTargetAtTime(0, now, RELEASE);
                    oscillator.stop(now + RELEASE * 6);
                    oscillator.onended = () => {
                        panner.disconnect();
                    };
                };
            }),
    ),
);

export type Played = {
    readonly level: Level;
    readonly shape: Shape;
    readonly glide: number;
};

export const applyLevel = (
    { context, oscillator, filter, gain, panner }: VoiceGraph,
    { level, shape, glide }: Played,
): void => {
    const now = context.currentTime;

    if (oscillator.type !== shape) {
        oscillator.type = shape;
    }

    oscillator.frequency.setTargetAtTime(level.frequency, now, Math.max(glide / 3, 0.002));
    filter.frequency.setTargetAtTime(level.cutoff, now, 0.01);
    gain.gain.setTargetAtTime(level.gain * HEADROOM, now, 0.006);
    panner.pan.setTargetAtTime(level.pan, now, 0.02);
};
