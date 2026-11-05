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

export const hit = (
    context: BaseAudioContext,
    bus: AudioNode,
    drum: Drum,
    at: number,
    velocity: number,
): void => {
    const start = Math.max(at, context.currentTime);
    const level = velocity * GAINS[drum];
    const decay = DECAYS[drum];
    const end = start + decay * 2 + 0.05;
    const out = decaying(context, level, start, decay);
    const started: AudioScheduledSourceNode[] = [];
    const play = (source: AudioScheduledSourceNode, into: AudioNode) => {
        source.connect(into);
        started.push(source);
    };

    const into = <N extends AudioNode>(node: N, next: AudioNode = out) => {
        node.connect(next);

        return node;
    };

    out.connect(bus);

    switch (drum) {
        case 'kick': {
            const body = context.createOscillator();
            const click = noiseOf(context, 0.02);

            sweep(body, 160, 45, start, 0.03);
            play(body, out);
            play(
                click,
                into(
                    filterOf(context, 'highpass', 1200),
                    into(decaying(context, 0.4, start, 0.01)),
                ),
            );
            break;
        }
        case 'snare': {
            const noise = noiseOf(context, decay * 2 + 0.05);
            const body = [185, 330].map(frequency => {
                const oscillator = context.createOscillator();

                oscillator.type = 'triangle';
                oscillator.frequency.value = frequency;

                return oscillator;
            });
            const tone = decaying(context, 0.5, start, 0.08);

            play(noise, into(filterOf(context, 'highpass', 1000)));
            body.forEach(oscillator => {
                play(oscillator, tone);
            });
            tone.connect(out);
            break;
        }
        case 'clap': {
            const noise = noiseOf(context, decay * 2 + 0.05);
            const bursts = context.createGain();

            [0, 0.011, 0.023].forEach(offset => {
                bursts.gain.setValueAtTime(1, start + offset);
                bursts.gain.setTargetAtTime(0.15, start + offset, 0.003);
            });
            bursts.gain.setValueAtTime(1, start + 0.034);
            play(noise, into(filterOf(context, 'bandpass', 1200, 1.2), into(bursts)));
            break;
        }
        case 'hat':
        case 'open': {
            const high = filterOf(context, 'highpass', 7000);
            const band = filterOf(context, 'bandpass', 10000, 0.8);

            METAL.forEach(frequency => {
                const oscillator = context.createOscillator();

                oscillator.type = 'square';
                oscillator.frequency.value = frequency;
                play(oscillator, high);
            });
            high.connect(band).connect(out);
            break;
        }
        case 'tom': {
            const body = context.createOscillator();

            sweep(body, 130, 88, start, 0.08);
            play(body, out);
            break;
        }
        case 'bell': {
            const band = filterOf(context, 'bandpass', 800, 1.5);

            [540, 800].forEach(frequency => {
                const oscillator = context.createOscillator();

                oscillator.type = 'square';
                oscillator.frequency.value = frequency;
                play(oscillator, band);
            });
            band.connect(out);
            break;
        }
    }

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
