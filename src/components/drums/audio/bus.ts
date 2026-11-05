import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { context$ } from '../../../shared/audio.ts';

export type DrumBus = { readonly context: AudioContext; readonly input: GainNode };

const HEADROOM = 0.5;

// Subscribe inside a user's click: a context made outside a gesture starts suspended and stays silent.
export const drumBus$ = context$.pipe(
    switchMap(
        context =>
            new Observable<DrumBus>(subscriber => {
                const input = context.createGain();
                const compressor = context.createDynamicsCompressor();

                input.gain.value = 0;
                compressor.threshold.value = -12;
                compressor.ratio.value = 4;
                input.connect(compressor).connect(context.destination);
                subscriber.next({ context, input });

                return () => {
                    input.gain.setTargetAtTime(0, context.currentTime, 0.02);
                    setTimeout(() => {
                        compressor.disconnect();
                    }, 200);
                };
            }),
    ),
);

export const applyVolume = ({ context, input }: DrumBus, volume: number): void => {
    input.gain.setTargetAtTime(volume * HEADROOM, context.currentTime, 0.01);
};
