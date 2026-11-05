import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { context$ } from '../../../shared/audio.ts';
import type { Played } from '../voice.ts';

export type VoiceGraph = {
    readonly context: AudioContext;
    readonly oscillator: OscillatorNode;
    // Open for the synth, shut for an instrument, whose notes come in at the filter instead.
    readonly drive: GainNode;
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
                const drive = context.createGain();
                const filter = context.createBiquadFilter();
                const gain = context.createGain();
                const panner = context.createStereoPanner();

                filter.type = 'lowpass';
                filter.Q.value = 0.7;
                gain.gain.value = 0;
                oscillator
                    .connect(drive)
                    .connect(filter)
                    .connect(gain)
                    .connect(panner)
                    .connect(context.destination);
                oscillator.start();
                subscriber.next({ context, oscillator, drive, filter, gain, panner });

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

export const applyLevel = (
    { context, oscillator, drive, filter, gain, panner }: VoiceGraph,
    { level, shape, glide, synth }: Played,
): void => {
    const now = context.currentTime;

    if (oscillator.type !== shape) {
        oscillator.type = shape;
    }

    drive.gain.setTargetAtTime(synth ? 1 : 0, now, 0.01);
    oscillator.frequency.setTargetAtTime(level.frequency, now, Math.max(glide / 3, 0.002));
    filter.frequency.setTargetAtTime(level.cutoff, now, 0.01);
    gain.gain.setTargetAtTime(level.gain * HEADROOM, now, 0.006);
    panner.pan.setTargetAtTime(level.pan, now, 0.02);
};
