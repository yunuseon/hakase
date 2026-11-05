const LOUDNESS = 0.3;

export type StringTone = { readonly sustain: number; readonly brightness: number };

// A hashed burst, not Math.random: the same note sounds the same each loop, and a test can measure it.
const burstOf = (length: number, brightness: number, seed: number) => {
    const white = Array.from({ length }, (_, index) => {
        const hashed = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;

        return 2 * (hashed - Math.floor(hashed)) - 1;
    });
    const smoothed = new Float32Array(length);

    for (let index = 0; index < length; index += 1) {
        const before = index > 0 ? (smoothed[index - 1] ?? 0) : 0;

        smoothed[index] = before + brightness * ((white[index] ?? 0) - before);
    }

    const mean = smoothed.reduce((sum, value) => sum + value, 0) / Math.max(1, length);
    const peak = smoothed.reduce((most, value) => Math.max(most, Math.abs(value - mean)), 1e-6);

    return smoothed.map(value => (0.9 * (value - mean)) / peak);
};

export const plucked = (
    sampleRate: number,
    frequency: number,
    seconds: number,
    { sustain, brightness }: StringTone,
    seed = 1,
) => {
    const samples = new Float32Array(Math.max(1, Math.round(seconds * sampleRate)));
    const period = sampleRate / frequency;
    // Per pass, so that every pitch falls 60 dB over `sustain`, the average's own loss at the fundamental made up.
    const damping = Math.min(
        0.99999,
        10 ** (-3 / (frequency * sustain)) / Math.cos((Math.PI * frequency) / sampleRate),
    );
    // Half a sample less: the two-point average delays by half a sample itself, and the period must come out whole.
    const delay = period - 0.5;
    const burst = burstOf(Math.min(samples.length, Math.ceil(period)), brightness, seed);
    const read = (position: number) => {
        const index = Math.floor(position);
        const into = position - index;
        const here = index >= 0 ? (samples[index] ?? 0) : 0;
        const next = index + 1 >= 0 ? (samples[index + 1] ?? 0) : 0;

        return here + (next - here) * into;
    };

    for (let index = 0; index < samples.length; index += 1) {
        samples[index] =
            index < burst.length
                ? (burst[index] ?? 0)
                : damping * 0.5 * (read(index - delay) + read(index - delay - 1));
    }

    // To one loudness just after the strike settles: a short burst holds far less of its fundamental than a long one.
    const from = Math.min(
        samples.length - 1,
        Math.max(Math.ceil(period * 4), Math.round(sampleRate * 0.08)),
    );
    const to = Math.min(samples.length, from + Math.round(sampleRate * 0.05));
    const energy = samples.subarray(from, to).reduce((sum, value) => sum + value * value, 0);
    const scale = Math.min(20, LOUDNESS / Math.sqrt(energy / Math.max(1, to - from) || 1e-9));

    return samples.map(value => value * scale);
};
