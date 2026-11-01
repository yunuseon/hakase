export type Clocks = {
    readonly zones: readonly string[];
};

export type ClockCommand =
    | { readonly kind: 'add'; readonly zone: string }
    | { readonly kind: 'remove'; readonly zone: string };

export const defaultClocks: Clocks = {
    zones: ['America/New_York', 'Europe/London', 'Asia/Tokyo'],
};

export const isTimeZone = (zone: string): boolean => {
    try {
        new Intl.DateTimeFormat(undefined, { timeZone: zone });

        return zone.trim() !== '';
    } catch {
        return false;
    }
};

// From the list, not resolvedOptions(): that answers Asia/Kolkata with the legacy Asia/Calcutta.
export const canonicalZone = (zone: string): string | null => {
    const wanted = zone.trim().toLowerCase();
    const listed = Intl.supportedValuesOf('timeZone').find(name => name.toLowerCase() === wanted);

    if (listed !== undefined || !isTimeZone(wanted)) {
        return listed ?? null;
    }

    const resolved = new Intl.DateTimeFormat(undefined, { timeZone: wanted }).resolvedOptions()
        .timeZone;

    return resolved.toLowerCase() === wanted
        ? resolved
        : wanted.replace(
              /(^|[/_-])([a-z])/g,
              (_, mark: string, letter: string) => mark + letter.toUpperCase(),
          );
};

export const reduceClocks = (clocks: Clocks, command: ClockCommand): Clocks => {
    switch (command.kind) {
        case 'add': {
            const zone = canonicalZone(command.zone);

            return zone === null || clocks.zones.includes(zone)
                ? clocks
                : { zones: [...clocks.zones, zone] };
        }
        case 'remove':
            return { zones: clocks.zones.filter(zone => zone !== command.zone) };
    }
};

type Parts = {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
};

const partsAt = (ms: number, zone: string): Parts => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
    }).formatToParts(ms);
    const part = (type: Intl.DateTimeFormatPartTypes): number =>
        Number(parts.find(found => found.type === type)?.value ?? 0);

    return {
        year: part('year'),
        month: part('month'),
        day: part('day'),
        hour: part('hour'),
        minute: part('minute'),
        second: part('second'),
    };
};

export const offsetMinutes = (ms: number, zone: string): number => {
    const { year, month, day, hour, minute, second } = partsAt(ms, zone);
    const wall = Date.UTC(year, month - 1, day, hour, minute, second);

    return Math.round((wall - Math.floor(ms / 1000) * 1000) / 60_000);
};

export const cityOf = (zone: string): string =>
    (zone.split('/').at(-1) ?? zone).replaceAll('_', ' ');

const pad = (value: number): string => String(value).padStart(2, '0');

export const differenceOf = (minutes: number): string => {
    if (minutes === 0) {
        return 'same time';
    }

    const hours = Math.floor(Math.abs(minutes) / 60);
    const rest = Math.abs(minutes) % 60;

    return `${minutes > 0 ? '+' : '−'}${hours}${rest === 0 ? '' : `:${pad(rest)}`} h`;
};

export type ClockRow = {
    readonly zone: string;
    readonly city: string;
    readonly time: string;
    readonly seconds: string;
    readonly day: string;
    readonly difference: string;
    readonly daylight: boolean;
    readonly turn: number;
};

export const clocksView = (
    zones: readonly string[],
    ms: number,
    local: string,
): readonly ClockRow[] => {
    const here = partsAt(ms, local);
    const hereOffset = offsetMinutes(ms, local);

    return zones.map(zone => {
        const there = partsAt(ms, zone);
        const days = Math.round(
            (Date.UTC(there.year, there.month - 1, there.day) -
                Date.UTC(here.year, here.month - 1, here.day)) /
                86_400_000,
        );

        return {
            zone,
            city: cityOf(zone),
            time: `${pad(there.hour)}:${pad(there.minute)}`,
            seconds: pad(there.second),
            day: days === 0 ? 'Today' : days > 0 ? 'Tomorrow' : 'Yesterday',
            difference: differenceOf(offsetMinutes(ms, zone) - hereOffset),
            daylight: there.hour >= 7 && there.hour < 19,
            turn: (there.hour * 60 + there.minute) / 1440,
        };
    });
};

export const parseClocks = (value: unknown): Clocks => {
    if (
        typeof value !== 'object' ||
        value === null ||
        !('zones' in value) ||
        !Array.isArray(value.zones)
    ) {
        return defaultClocks;
    }

    const zones = value.zones
        .filter((zone): zone is string => typeof zone === 'string')
        .map(canonicalZone)
        .filter(zone => zone !== null);

    return { zones: [...new Set(zones)] };
};
