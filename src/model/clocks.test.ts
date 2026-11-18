import { describe, expect, it } from 'vitest';
import {
    clocksView,
    defaultClocks,
    differenceOf,
    offsetMinutes,
    parseClocks,
    reduceClocks,
} from './clocks.ts';

const winter = Date.UTC(2026, 0, 15, 22, 30, 5);
const summer = Date.UTC(2026, 6, 15, 12, 0, 0);

describe('offsetMinutes', () => {
    it('follows daylight saving and half-hour zones', () => {
        expect(offsetMinutes(winter, 'Europe/Berlin')).toBe(60);
        expect(offsetMinutes(summer, 'Europe/Berlin')).toBe(120);
        expect(offsetMinutes(winter, 'Asia/Kolkata')).toBe(330);
        expect(offsetMinutes(winter, 'UTC')).toBe(0);
    });
});

describe('differenceOf', () => {
    it('writes hours and minutes with a sign', () => {
        expect(differenceOf(0)).toBe('same time');
        expect(differenceOf(-360)).toBe('−6 h');
        expect(differenceOf(270)).toBe('+4:30 h');
    });
});

describe('clocksView', () => {
    it('reads each zone against the local one, across midnight', () => {
        const [tokyo, york] = clocksView(
            ['Asia/Tokyo', 'America/New_York'],
            winter,
            'Europe/Berlin',
        );

        expect(tokyo).toMatchObject({
            city: 'Tokyo',
            time: '07:30',
            seconds: '05',
            day: 'Tomorrow',
            difference: '+8 h',
            daylight: true,
        });
        expect(york).toMatchObject({
            city: 'New York',
            time: '17:30',
            day: 'Today',
            difference: '−6 h',
        });
    });
});

describe('reduceClocks', () => {
    it('adds a real zone once, in its own spelling', () => {
        const added = reduceClocks(defaultClocks, { kind: 'add', zone: ' europe/berlin ' });

        expect(added.zones.at(-1)).toBe('Europe/Berlin');
        expect(reduceClocks(added, { kind: 'add', zone: 'Europe/Berlin' })).toBe(added);
        expect(reduceClocks(added, { kind: 'add', zone: 'Mars/Olympus' })).toBe(added);
        expect(reduceClocks(added, { kind: 'add', zone: 'asia/kolkata' }).zones.at(-1)).toBe(
            'Asia/Kolkata',
        );
    });
});

describe('parseClocks', () => {
    it('keeps real zones once each', () => {
        expect(parseClocks({ zones: ['UTC', 'nope', 3, 'utc'] }).zones).toEqual(['UTC']);
        expect(parseClocks(null)).toBe(defaultClocks);
    });
});
