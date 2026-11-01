export type Day = string;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number): string => String(value).padStart(2, '0');

export const dayOf = (ms: number): Day => {
    const date = new Date(ms);

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const isDay = (value: string): value is Day => {
    const match = DAY.exec(value);

    return match !== null && dayOf(dateOf(value).getTime()) === value;
};

const dateOf = (day: Day): Date => {
    const [, year = '1970', month = '1', date = '1'] = DAY.exec(day) ?? [];

    // Noon, not midnight: a daylight-saving change can never move it into the next or previous day.
    return new Date(Number(year), Number(month) - 1, Number(date), 12);
};

export const shiftDay = (day: Day, days: number): Day => {
    const date = dateOf(day);
    date.setDate(date.getDate() + days);

    return dayOf(date.getTime());
};

export const minuteOfDay = (ms: number): number => {
    const date = new Date(ms);

    return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
};

export const weekdayOf = (day: Day): number => dateOf(day).getDay();

export const dayLabel = (day: Day, locale?: string): string =>
    new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
        dateOf(day),
    );

export const shortDayLabel = (day: Day, locale?: string): string =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(dateOf(day));

export const daysBetween = (from: Day, to: Day): number =>
    Math.round((dateOf(to).getTime() - dateOf(from).getTime()) / 86_400_000);
