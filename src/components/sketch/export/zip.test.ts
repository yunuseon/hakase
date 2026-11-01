import { describe, expect, it } from 'vitest';
import { crc32, zip, zipEntry } from './zip.ts';

const bytesOf = (text: string): Uint8Array<ArrayBuffer> =>
    new Uint8Array(new TextEncoder().encode(text));

const joined = (parts: readonly Uint8Array[]): Uint8Array => {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    parts.reduce((offset, part) => {
        out.set(part, offset);

        return offset + part.length;
    }, 0);

    return out;
};

describe('crc32', () => {
    it('gives the standard check value', () => {
        expect(crc32(bytesOf('123456789'))).toBe(0xcbf43926);
    });
});

describe('zip', () => {
    const files = [
        zipEntry('frame-00001.png', bytesOf('hello')),
        zipEntry('frame-00002.png', bytesOf('world!')),
    ];
    const archive = joined(zip(files));
    const view = new DataView(archive.buffer);
    const end = archive.length - 22;

    it('ends with a directory that counts every file', () => {
        expect(view.getUint32(end, true)).toBe(0x06054b50);
        expect(view.getUint16(end + 10, true)).toBe(2);
    });

    it('stores each file where the directory says, under its name and checksum', () => {
        const directoryStart = view.getUint32(end + 16, true);
        const entries = files.reduce<{ at: number; found: string[] }>(
            ({ at, found }) => {
                const nameLength = view.getUint16(at + 28, true);
                const name = new TextDecoder().decode(archive.slice(at + 46, at + 46 + nameLength));
                const local = view.getUint32(at + 42, true);
                const size = view.getUint32(local + 18, true);
                const dataAt = local + 30 + view.getUint16(local + 26, true);
                const data = archive.slice(dataAt, dataAt + size);

                expect(view.getUint32(local, true)).toBe(0x04034b50);
                expect(view.getUint32(local + 14, true)).toBe(crc32(data));

                return {
                    at: at + 46 + nameLength,
                    found: [...found, `${name}:${new TextDecoder().decode(data)}`],
                };
            },
            { at: directoryStart, found: [] },
        );

        expect(entries.found).toEqual(['frame-00001.png:hello', 'frame-00002.png:world!']);
    });
});
