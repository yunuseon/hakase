import { ringOf, STAGE, type Instrument, type Source } from '../instruments.ts';
import { plucked } from '../string.ts';

const hashed = (index: number, seed: number) => {
    const value = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;

    return 2 * (value - Math.floor(value)) - 1;
};

const bufferOf = (context: BaseAudioContext, samples: Float32Array<ArrayBuffer>) => {
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);

    buffer.copyToChannel(samples, 0);

    return buffer;
};

const faded = (context: BaseAudioContext, level: number, start: number, fade: number | null) => {
    const gain = context.createGain();

    gain.gain.setValueAtTime(level, start);
    if (fade !== null) {
        gain.gain.setTargetAtTime(0, start, fade / STAGE);
    }

    return gain;
};

type Sounded = {
    readonly sources: readonly AudioScheduledSourceNode[];
    readonly tuned: readonly OscillatorNode[];
};

const sourceInto = (
    context: BaseAudioContext,
    source: Source,
    frequency: number,
    start: number,
    length: number,
    into: AudioNode,
): Sounded => {
    switch (source.kind) {
        case 'partials': {
            const oscillators = source.partials.map(({ shape, ratio, level, detune, fade }) => {
                const oscillator = context.createOscillator();

                oscillator.type = shape;
                oscillator.frequency.value = frequency * ratio;
                oscillator.detune.value = detune;
                oscillator.connect(faded(context, level, start, fade)).connect(into);

                return oscillator;
            });

            return { sources: oscillators, tuned: oscillators };
        }
        case 'fm': {
            const carrier = context.createOscillator();
            const modulator = context.createOscillator();
            const depth = context.createGain();

            carrier.frequency.value = frequency;
            modulator.frequency.value = frequency * source.ratio;
            depth.gain.setValueAtTime(source.index * frequency * source.ratio, start);
            depth.gain.setTargetAtTime(0, start, source.fade / STAGE);
            modulator.connect(depth).connect(carrier.frequency);
            carrier.connect(faded(context, source.level, start, null)).connect(into);

            return { sources: [carrier, modulator], tuned: [carrier, modulator] };
        }
        case 'string': {
            const string = context.createBufferSource();

            string.buffer = bufferOf(
                context,
                plucked(context.sampleRate, frequency, length, source, Math.round(frequency)),
            );
            string.connect(faded(context, source.level, start, null)).connect(into);

            return { sources: [string], tuned: [] };
        }
        case 'noise': {
            const noise = context.createBufferSource();
            const band = context.createBiquadFilter();
            const samples = Float32Array.from(
                { length: Math.max(1, Math.round(length * context.sampleRate)) },
                (_, index) => hashed(index, frequency),
            );

            noise.buffer = bufferOf(context, samples);
            band.type = 'bandpass';
            band.frequency.value = Math.min(18000, frequency * source.band);
            band.Q.value = source.q;
            noise
                .connect(band)
                .connect(faded(context, source.level, start, source.fade))
                .connect(into);

            return { sources: [noise], tuned: [] };
        }
    }
};

export const strike = (
    context: BaseAudioContext,
    bus: AudioNode,
    instrument: Instrument,
    frequency: number,
    at: number,
    held: number,
): void => {
    const start = Math.max(at, context.currentTime);
    const { attack, decay, sustain, release } = instrument.amp;
    const peak = instrument.gain;
    // At least its attack: a release that began before the rise ended would fight it.
    const holding = Math.max(held, attack);
    const length = ringOf(instrument, holding);
    const end = start + length;
    const envelope = context.createGain();
    const gain = envelope.gain;

    gain.setValueAtTime(0, start);
    if (attack > 0) {
        gain.linearRampToValueAtTime(peak, start + attack);
    } else {
        gain.setValueAtTime(peak, start);
    }
    gain.setTargetAtTime(sustain * peak, start + attack, Math.max(decay, 1e-3) / STAGE);
    if (holding < length) {
        gain.setTargetAtTime(0, start + holding, Math.max(release, 1e-3) / STAGE);
    }

    if (instrument.filter === null) {
        envelope.connect(bus);
    } else {
        const lowpass = context.createBiquadFilter();
        const cutoff = Math.min(18000, frequency * instrument.filter.cutoff);

        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(
            Math.min(18000, cutoff * 2 ** instrument.filter.sweep),
            start,
        );
        lowpass.frequency.setTargetAtTime(cutoff, start, instrument.filter.fade / STAGE);
        envelope.connect(lowpass).connect(bus);
    }

    const sounded = instrument.sources.map(source =>
        sourceInto(context, source, frequency, start, length, envelope),
    );
    const sources = sounded.flatMap(({ sources: made }) => made);

    if (instrument.vibrato !== null) {
        const lfo = context.createOscillator();
        const depth = context.createGain();
        const { rate, cents, delay } = instrument.vibrato;

        lfo.frequency.value = rate;
        depth.gain.setValueAtTime(0, start);
        depth.gain.linearRampToValueAtTime(0, start + delay);
        depth.gain.linearRampToValueAtTime(cents, start + delay + 0.3);
        lfo.connect(depth);
        sounded
            .flatMap(({ tuned }) => tuned)
            .forEach(oscillator => {
                depth.connect(oscillator.detune);
            });
        lfo.start(start);
        lfo.stop(end);
    }

    sources.forEach(source => {
        source.start(start);
        source.stop(end);
    });
    // Its nodes go when its first source ends; everything in a note stops at the same moment.
    const [first] = sources;

    if (first !== undefined) {
        first.onended = () => {
            envelope.disconnect();
        };
    }
};
