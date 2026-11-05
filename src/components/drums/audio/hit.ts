import { DECAYS, type Drum } from '../drums.ts';

// From offline renders, to a drum machine's balance: the kick leads, snare, clap and tom a step under, hats and bell light.
const GAINS: Readonly<Record<Drum, number>> = {
    kick: 1,
    snare: 1,
    clap: 5,
    hat: 0.6,
    open: 0.6,
    tom: 0.7,
    bell: 0.45,
};

const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800] as const;

const noiseOf = (context: BaseAudioContext, seconds: number) => {
    const length = Math.max(1, Math.round(seconds * context.sampleRate));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const samples = Float32Array.from({ length }, (_, index) => {
        const value = Math.sin((index + 1) * 12.9898) * 43758.5453;

        return 2 * (value - Math.floor(value)) - 1;
    });

    buffer.copyToChannel(samples, 0);

    const source = context.createBufferSource();
    source.buffer = buffer;

    return source;
};

const filterOf = (
    context: BaseAudioContext,
    type: BiquadFilterType,
    frequency: number,
    q = 0.7,
) => {
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;

    return filter;
};

const decaying = (context: BaseAudioContext, level: number, start: number, decay: number) => {
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, start);
    gain.gain.setTargetAtTime(0, start, decay / 3);

    return gain;
};

const sweep = (
    oscillator: OscillatorNode,
    from: number,
    to: number,
    start: number,
    time: number,
) => {
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.setTargetAtTime(to, start, time);
};

const toneOf = (context: BaseAudioContext, type: OscillatorType, frequency: number) => {
    const oscillator = context.createOscillator();

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    return oscillator;
};

const wired = <N extends AudioNode>(node: N, into: AudioNode) => {
    node.connect(into);

    return node;
};

const sourcesOf = (
    context: BaseAudioContext,
    drum: Drum,
    start: number,
    out: AudioNode,
): readonly AudioScheduledSourceNode[] => {
    const decay = DECAYS[drum];

    switch (drum) {
        case 'kick': {
            const body = context.createOscillator();
            const click = wired(
                filterOf(context, 'highpass', 1200),
                wired(decaying(context, 0.4, start, 0.01), out),
            );

            sweep(body, 160, 45, start, 0.03);

            return [wired(body, out), wired(noiseOf(context, 0.02), click)];
        }
        case 'snare': {
            const tone = wired(decaying(context, 0.5, start, 0.08), out);

            return [
                wired(
                    noiseOf(context, decay * 2 + 0.05),
                    wired(filterOf(context, 'highpass', 1000), out),
                ),
                ...[185, 330].map(frequency => wired(toneOf(context, 'triangle', frequency), tone)),
            ];
        }
        case 'clap': {
            const bursts = wired(context.createGain(), out);

            [0, 0.011, 0.023].forEach(offset => {
                bursts.gain.setValueAtTime(1, start + offset);
                bursts.gain.setTargetAtTime(0.15, start + offset, 0.003);
            });
            bursts.gain.setValueAtTime(1, start + 0.034);

            return [
                wired(
                    noiseOf(context, decay * 2 + 0.05),
                    wired(filterOf(context, 'bandpass', 1200, 1.2), bursts),
                ),
            ];
        }
        case 'hat':
        case 'open': {
            const high = wired(
                filterOf(context, 'highpass', 7000),
                wired(filterOf(context, 'bandpass', 10000, 0.8), out),
            );

            return METAL.map(frequency => wired(toneOf(context, 'square', frequency), high));
        }
        case 'tom': {
            const body = context.createOscillator();

            sweep(body, 130, 88, start, 0.08);

            return [wired(body, out)];
        }
        case 'bell': {
            const band = wired(filterOf(context, 'bandpass', 800, 1.5), out);

            return [540, 800].map(frequency => wired(toneOf(context, 'square', frequency), band));
        }
    }
};

export const hit = (
    context: BaseAudioContext,
    bus: AudioNode,
    drum: Drum,
    at: number,
    velocity: number,
): void => {
    const start = Math.max(at, context.currentTime);
    const decay = DECAYS[drum];
    const end = start + decay * 2 + 0.05;
    const out = wired(decaying(context, velocity * GAINS[drum], start, decay), bus);
    const started = sourcesOf(context, drum, start, out);

    started.forEach(source => {
        source.start(start);
        source.stop(end);
    });

    const [first] = started;

    if (first !== undefined) {
        first.onended = () => {
            out.disconnect();
        };
    }
};
