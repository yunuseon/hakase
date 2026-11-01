import { describe, expect, it } from 'vitest';
import {
    emptyLinks,
    faviconOf,
    parseLinks,
    reduceLinks,
    safeUrl,
    type LinkCommand,
    type Links,
} from './links.ts';

const run = (...commands: LinkCommand[]): Links => commands.reduce(reduceLinks, emptyLinks);

describe('safeUrl', () => {
    it('accepts web addresses, with or without a scheme', () => {
        expect(safeUrl('example.com/a?b=1')).toBe('https://example.com/a?b=1');
        expect(safeUrl('http://localhost.test:5173')).toBe('http://localhost.test:5173/');
    });

    it('refuses anything that could run or is not an address', () => {
        expect(safeUrl('javascript:alert(1)')).toBeNull();
        expect(safeUrl('JavaScript:alert(1)')).toBeNull();
        expect(safeUrl('data:text/html,<b>x</b>')).toBeNull();
        expect(safeUrl('not a url')).toBeNull();
        expect(safeUrl('word')).toBeNull();
    });
});

describe('faviconOf', () => {
    it('asks the site itself, at its origin, and only over https', () => {
        expect(faviconOf('https://wiki.example.org/home?x=1')).toBe(
            'https://wiki.example.org/favicon.ico',
        );
        expect(faviconOf('http://example.com/')).toBeNull();
        expect(faviconOf('nonsense')).toBeNull();
    });
});

describe('reduceLinks', () => {
    it('names a link by the words before it, or by its host', () => {
        const links = run(
            { kind: 'add', text: 'www.example.com' },
            { kind: 'add', text: 'Team wiki https://wiki.example.org/home' },
            { kind: 'add', text: 'javascript:alert(1)' },
        );

        expect(links.items.map(({ title }) => title)).toEqual(['example.com', 'Team wiki']);
    });

    it('falls back to the host when a rename is emptied, and reorders', () => {
        const links = run(
            { kind: 'add', text: 'a.com' },
            { kind: 'add', text: 'B https://b.com' },
            { kind: 'rename', id: 'link-2', title: ' ' },
            { kind: 'move', id: 'link-2', to: 0 },
        );

        expect(links.items.map(({ title }) => title)).toEqual(['b.com', 'a.com']);
    });
});

describe('parseLinks', () => {
    it('drops stored links that are not web addresses', () => {
        const links = parseLinks({
            items: [
                { id: 'link-5', url: 'javascript:alert(1)', title: 'x' },
                { id: 'link-2', url: 'https://ok.com', title: 'ok' },
            ],
            made: 0,
        });

        expect(links).toEqual({
            items: [{ id: 'link-2', url: 'https://ok.com/', title: 'ok' }],
            made: 2,
        });
    });
});
