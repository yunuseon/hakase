import type { StreamsView } from './components/streams/streams.component.ts';
import type { Report } from './diagnostics.ts';

const TURNS_SHOWN = 8;

const agoText = (ms: number | null): string =>
    ms === null
        ? '—'
        : ms < 1000
          ? `${ms} ms`
          : ms < 60_000
            ? `${Math.round(ms / 1000)} s`
            : `${Math.round(ms / 60_000)} min`;

const firedText = (fired: readonly string[]): string =>
    [...new Set(fired)]
        .map(stream => {
            const times = fired.filter(each => each === stream).length;

            return times > 1 ? `${stream} ×${times}` : stream;
        })
        .join(' · ');

export const streamsViewOf = ({ at, windowMs, streams, doubles, recent }: Report): StreamsView => {
    const fresh = doubles.filter(double => at - double.at <= windowMs);
    const firing = streams.filter(({ perSecond }) => perSecond > 0).length;
    const newest = fresh.at(-1);
    const rewrite = streams.find(({ name }) => name === 'rewrites');

    return {
        lanes: streams.map(({ name, total, perSecond, last, agoMs, doubled, firedAgoMs }) => ({
            name,
            rate: `${perSecond}/s`,
            last: last ?? '',
            ago: agoText(agoMs),
            total,
            dots: firedAgoMs.map(ago => Math.max(0, 1 - ago / windowMs)),
            doubled,
        })),
        turns: recent
            .slice(-TURNS_SHOWN)
            .reverse()
            .map(({ at: when, fired }, index) => ({
                key: `${when}:${index}`,
                ago: agoText(Math.max(0, at - when)),
                fired: firedText(fired),
            })),
        summary: `${firing} of ${streams.length} firing · last ${windowMs / 1000} s`,
        warning:
            newest !== undefined
                ? `${newest.stream} fired ${newest.times}× in one turn${
                      newest.with.length > 0 ? `, with ${newest.with.join(', ')}` : ''
                  }`
                : rewrite?.last && rewrite.agoMs !== null && rewrite.agoMs <= windowMs
                  ? `rendered twice: ${rewrite.last}`
                  : null,
    };
};
