import { concatBytes, offsetsOf } from './bytes.ts';

export type ZipEntry = {
    readonly name: string;
    readonly data: Uint8Array<ArrayBuffer>;
    readonly crc: number;
};

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) =>
    Array.from({ length: 8 }).reduce<number>(
        crc => (crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1),
        n,
    ),
);

// A loop, not reduce: a callback per byte took most of a second over the 70 MB of a 240-frame PNG export.
export const crc32 = (data: Uint8Array): number => {
    let crc = 0xffffffff;

    for (let index = 0; index < data.length; index += 1) {
        crc = (CRC_TABLE[(crc ^ (data[index] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
};

// Checksummed as each file arrives, so a long export does not save all of it for the end.
export const zipEntry = (name: string, data: Uint8Array<ArrayBuffer>): ZipEntry => ({
    name,
    data,
    crc: crc32(data),
});

const record = (fields: readonly (readonly [number, 2 | 4])[]): Uint8Array<ArrayBuffer> => {
    const bytes = new Uint8Array(fields.reduce((sum, [, width]) => sum + width, 0));
    const view = new DataView(bytes.buffer);
    fields.reduce((offset, [value, width]) => {
        if (width === 2) {
            view.setUint16(offset, value, true);
        } else {
            view.setUint32(offset, value, true);
        }

        return offset + width;
    }, 0);

    return bytes;
};

// 1980-01-01, the earliest date a zip can hold: a fixed stamp keeps the archive a pure function of its entries.
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

// Stored, since PNGs are compressed already; and parts for a Blob, as joining them copied all 70 MB once more.
export const zip = (entries: readonly ZipEntry[]): readonly Uint8Array<ArrayBuffer>[] => {
    const files = entries.map(({ name, data, crc }) => ({
        name: new TextEncoder().encode(name),
        data,
        crc,
    }));

    const locals = files.map(({ name, data, crc }) => [
        record([
            [0x04034b50, 4],
            [20, 2],
            [0, 2],
            [0, 2],
            [0, 2],
            [DOS_DATE, 2],
            [crc, 4],
            [data.length, 4],
            [data.length, 4],
            [name.length, 2],
            [0, 2],
        ]),
        name,
        data,
    ]);

    const offsets = offsetsOf(
        locals.map(parts => parts.reduce((sum, part) => sum + part.length, 0)),
    );

    const central = concatBytes(
        files.flatMap(({ name, data, crc }, index) => [
            record([
                [0x02014b50, 4],
                [20, 2],
                [20, 2],
                [0, 2],
                [0, 2],
                [0, 2],
                [DOS_DATE, 2],
                [crc, 4],
                [data.length, 4],
                [data.length, 4],
                [name.length, 2],
                [0, 2],
                [0, 2],
                [0, 2],
                [0, 2],
                [0, 4],
                [offsets[index] ?? 0, 4],
            ]),
            name,
        ]),
    );

    const start =
        (offsets.at(-1) ?? 0) + (locals.at(-1)?.reduce((sum, part) => sum + part.length, 0) ?? 0);

    return [
        ...locals.flat(),
        central,
        record([
            [0x06054b50, 4],
            [0, 2],
            [0, 2],
            [files.length, 2],
            [files.length, 2],
            [central.length, 4],
            [start, 4],
            [0, 2],
        ]),
    ];
};
