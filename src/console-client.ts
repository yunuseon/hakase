import { asapScheduler, combineLatest, EMPTY, fromEvent, merge, type Observable } from 'rxjs';
import {
    buffer,
    connect,
    debounceTime,
    distinctUntilChanged,
    filter,
    finalize,
    ignoreElements,
    map,
    scan,
    startWith,
    switchMap,
    take,
    tap,
} from 'rxjs/operators';
import {
    forAgents,
    keysAt,
    lineOf,
    mentions,
    valueAt,
    windowsListOf,
    type Report,
} from './diagnostics.ts';
import { commandsOf, pickedOf } from './commands.ts';
import type { Core } from './core.ts';
import { workspaceOf, type History } from './documents.ts';
import { heard, recordingOf, recordingSource, type Recording } from './recording.ts';
import { serialised } from './state-store.ts';
import type { Diagnostics } from './graph/diagnostics.graph.ts';
import { programList } from './programs.ts';
import { displayable } from './shared/plain.ts';

const EVENT = 'hakase';
const RUN = 'hakase:run';
const RECORD = 'hakase:record';

const HELP = `hakase, from the console. Every call returns plain data.
  hakase.report()        streams: rate, last value, how often each fired twice in one turn; the last turns in order
  hakase.windows()       every window: name, program, state, what it follows, frame, which is in front
  hakase.history(n)      the last n undo steps, newest last; undone ones marked
  hakase.keys(path)      what is under a path of the documents, e.g. keys('scenes')
  hakase.inspect(path)   the value there as JSON, e.g. inspect('scenes.store-3.objects.0')
  hakase.listen(...words) log one line per turn (what started it → what it reached); only turns naming a word, if given
  hakase.quiet()         stop logging
  hakase.commands(word)  every command the palette offers now: id, label, group; only those naming a word, if given
  hakase.run(id, text)   run one as if picked in the palette, e.g. run('launch:scene'), run('capture:todo:todo', 'milk')
  hakase.record()        start recording everything the core receives, from the state as it is now
  hakase.stop(name)      stop; saves the recording as the module src/recordings/<name>.ts (lowercase, digits, -)
                         for a test to replay in Node with replayed() from src/replay.ts; without a name, returns it
  hakase.dump()          report, windows and history as one JSON string, to paste
A turn is everything one event caused before the next microtask. A stream fired twice in one turn is the
"reached a combineLatest by two paths" bug AGENTS.md warns about. The rewrites stream is its symptom in a
window: one place in its DOM written more than once in a turn, so it rendered twice and once was stale.
Windows carry data-process, the id windows() lists.`;

type Listening = readonly string[] | null;

const listeningOf = (event: Event): Listening => {
    const detail: unknown = event instanceof CustomEvent ? event.detail : null;

    return Array.isArray(detail) ? detail.filter(word => typeof word === 'string') : null;
};

const send = (listening: Listening): void => {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: listening }));
};

export type Run = { readonly id: string; readonly text: string | null };

const runOf = (event: Event): Run | null => {
    const detail: unknown = event instanceof CustomEvent ? event.detail : null;

    return typeof detail === 'object' &&
        detail !== null &&
        'id' in detail &&
        typeof detail.id === 'string'
        ? {
              id: detail.id,
              text: 'text' in detail && typeof detail.text === 'string' ? detail.text : null,
          }
        : null;
};

export const consoleRuns$: Observable<Run> = fromEvent(window, RUN).pipe(
    map(runOf),
    filter(run => run !== null),
);

type Mirror = {
    readonly report: Report;
    readonly history: History;
    readonly recording: Recording | null;
};

const recordOf = (event: Event): boolean => event instanceof CustomEvent && event.detail === true;

const steps = ({ steps: all, cursor }: History, count: number) =>
    all.map(({ id, label }, index) => ({ id, label, undone: index >= cursor })).slice(-count);

// The mirror is read at each call, not captured: an agent's saved `const h = hakase` must not go stale.
const apiOf = (mirror: () => Mirror) => {
    const present = () => mirror().history.present;
    const windows = () => windowsListOf(workspaceOf(present()));
    const commands = (word = '') =>
        commandsOf(programList, workspaceOf(present()))
            .filter(({ id, label, group }) =>
                `${id} ${label} ${group}`.toLowerCase().includes(word.toLowerCase()),
            )
            .map(({ id, label, group }) => ({ id, label, group }));

    return {
        help: () => HELP,
        report: () => forAgents(mirror().report),
        windows,
        history: (count = 10) => steps(mirror().history, count),
        keys: (path = '') => keysAt(valueAt(present(), path)),
        inspect: (path = '') => displayable(valueAt(present(), path)),
        listen: (...words: string[]) => {
            send(words);
            return words.length > 0 ? `listening for ${words.join(', ')}` : 'listening';
        },
        quiet: () => {
            send(null);
            return 'quiet';
        },
        commands,
        run: (id: string, text: string | null = null) => {
            if (pickedOf(id, text) === null) {
                return `not a command: ${id}${text === null ? '' : ` ${text}`}; see commands()`;
            }
            window.dispatchEvent(new CustomEvent(RUN, { detail: { id, text } }));
            return `ran ${id}`;
        },
        record: () => {
            window.dispatchEvent(new CustomEvent(RECORD, { detail: true }));
            return 'recording';
        },
        stop: (name?: string) => {
            const { recording } = mirror();
            window.dispatchEvent(new CustomEvent(RECORD, { detail: false }));
            if (recording === null) return 'nothing recorded; call record() first';
            const source = recordingSource(recording);

            return name === undefined
                ? source
                : fetch(`/__hakase/recordings/${name}`, { method: 'POST', body: source }).then(
                      response =>
                          response.ok ? response.text() : `refused: ${String(response.status)}`,
                  );
        },
        dump: () =>
            JSON.stringify(
                {
                    report: forAgents(mirror().report),
                    windows: windows(),
                    history: steps(mirror().history, 20),
                },
                null,
                1,
            ),
    };
};

export type Hakase = ReturnType<typeof apiOf>;

declare global {
    interface Window {
        hakase?: Hakase;
        hakaseMirror?: Mirror;
    }
}

export const console$ = (
    { report$, turns$ }: Diagnostics,
    { history$, snapshot$, received$ }: Pick<Core, 'history$' | 'snapshot$' | 'received$'>,
): Observable<never> => {
    const listening$ = fromEvent(window, EVENT).pipe(map(listeningOf), startWith(null));
    const recording$ = fromEvent(window, RECORD).pipe(
        map(recordOf),
        distinctUntilChanged(),
        switchMap(on =>
            on
                ? snapshot$.pipe(
                      take(1),
                      switchMap(snapshot => {
                          const begun = performance.now();

                          return received$.pipe(
                              connect(shared$ =>
                                  shared$.pipe(
                                      buffer(shared$.pipe(debounceTime(0, asapScheduler))),
                                  ),
                              ),
                              filter(received => received.length > 0),
                              map(received => ({ at: performance.now() - begun, received })),
                              scan(heard, recordingOf(serialised(snapshot), Date.now())),
                              startWith(recordingOf(serialised(snapshot), Date.now())),
                          );
                      }),
                  )
                : EMPTY,
        ),
        startWith(null),
    );

    return merge(
        combineLatest({ report: report$, history: history$, recording: recording$ }).pipe(
            tap(mirror => {
                window.hakaseMirror = mirror;
                window.hakase ??= apiOf(() => window.hakaseMirror ?? mirror);
            }),
            finalize(() => {
                delete window.hakase;
                delete window.hakaseMirror;
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
