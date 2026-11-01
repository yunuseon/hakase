export const concatBytes = (parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> => {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    parts.reduce((offset, part) => {
        out.set(part, offset);

        return offset + part.length;
    }, 0);

    return out;
};

export const offsetsOf = (lengths: readonly number[], start = 0): readonly number[] =>
    lengths
        .reduce<readonly number[]>(
            (starts, length) => [...starts, (starts.at(-1) ?? start) + length],
            [start],
        )
        .slice(0, lengths.length);
