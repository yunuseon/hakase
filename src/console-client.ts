import { combineLatest, EMPTY, fromEvent, merge, type Observable } from 'rxjs';
import { filter, finalize, ignoreElements, map, startWith, switchMap, tap } from 'rxjs/operators';
import { keysAt, lineOf, mentions, valueAt, windowsListOf, type Report } from './diagnostics.ts';
import { workspaceOf, type History } from './documents.ts';
import type { Diagnostics } from './graph/diagnostics.graph.ts';
import { displayable } from './shared/plain.ts';

const EVENT = 'hakase';

const HELP = `hakase, from the console. Every call returns plain data.
  hakase.report()        streams: rate, last value, how often each fired twice in one turn; the last turns in order
  hakase.windows()       every window: name, program, state, what it follows, frame, which is in front
  hakase.history(n)      the last n undo steps, newest last; undone ones marked
  hakase.keys(path)      what is under a path of the documents, e.g. keys('scenes')
  hakase.inspect(path)   the value there as JSON, e.g. inspect('scenes.store-3.objects.0')
  hakase.listen(...words) log one line per turn (what started it → what it reached); only turns naming a word, if given
  hakase.quiet()         stop logging
  hakase.dump()          report, windows and history as one JSON string, to paste
A turn is everything one event caused before the next microtask. A stream fired twice in one turn is the
"reached a combineLatest by two paths" bug AGENTS.md warns about.`;

type Listening = readonly string[] | null;

const listeningOf = (event: Event): Listening => {
    const detail: unknown = event instanceof CustomEvent ? event.detail : null;

    return Array.isArray(detail) ? detail.filter(word => typeof word === 'string') : null;
};

const send = (listening: Listening): void => {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: listening }));
};

type Mirror = { readonly report: Report; readonly history: History };

const steps = ({ steps: all, cursor }: History, count: number) =>
    all.map(({ id, label }, index) => ({ id, label, undone: index >= cursor })).slice(-count);

const apiOf = ({ report, history }: Mirror) => {
    const windows = () => windowsListOf(workspaceOf(history.present));

    return {
        help: () => HELP,
        report: () => report,
        windows,
        history: (count = 10) => steps(history, count),
        keys: (path = '') => keysAt(valueAt(history.present, path)),
        inspect: (path = '') => displayable(valueAt(history.present, path)),
        listen: (...words: string[]) => {
            send(words);
            return words.length > 0 ? `listening for ${words.join(', ')}` : 'listening';
        },
        quiet: () => {
            send(null);
            return 'quiet';
        },
        dump: () =>
            JSON.stringify({ report, windows: windows(), history: steps(history, 20) }, null, 1),
    };
};

export type Hakase = ReturnType<typeof apiOf>;

declare global {
    interface Window {
        hakase?: Hakase;
    }
}

export const console$ = (
    { report$, turns$ }: Diagnostics,
    history$: Observable<History>,
): Observable<never> => {
    const listening$ = fromEvent(window, EVENT).pipe(map(listeningOf), startWith(null));

    return merge(
        combineLatest({ report: report$, history: history$ }).pipe(
            tap(mirror => {
                window.hakase = apiOf(mirror);
            }),
            finalize(() => {
                delete window.hakase;
            }),
        ),
        listening$.pipe(
            switchMap(words =>
                words === null
                    ? EMPTY
                    : turns$.pipe(
                          filter(turn => mentions(turn, words)),
                          map(lineOf),
                          tap(line => console.info(line)),
                      ),
            ),
        ),
    ).pipe(ignoreElements());
};
