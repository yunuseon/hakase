import { GATE_DEFAULTS } from '../gates.ts';
import { defaultPedal } from '../pedals.ts';
import { NONE } from '../image.ts';
import { animationFrames, defer, EMPTY, fromEvent, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    finalize,
    ignoreElements,
    map,
    pairwise,
    scan,
    share,
    shareReplay,
    startWith,
    switchMap,
    takeUntil,
} from 'rxjs/operators';
import { appearances } from '../appearances.ts';
import { themes } from '../components/sketch/themes/registry.ts';
import { sourceOf } from '../library.ts';
import { drawingOf } from '../components/pen/pen.ts';
import { defaultVoice, soundingOf } from '../components/voice/voice.ts';
import { defaultDrums, kitOf } from '../components/drums/drums.ts';
import { waveOf } from '../shared/signal.ts';
import type { AppInput, AppState, Program, Self } from '../program.ts';
import type { Settings } from '../settings.ts';
import { reduceSandbox, sandboxSeed, type Sandbox, type SandboxInput } from './sandbox.ts';
import { recorded, type Demo } from './story.ts';

export const programDemo = (
    program: Program,
    settings: Settings | undefined,
    empty = false,
): Demo => {
    const process = program.launch();
    const lifetime = new AbortController();
    const end$ = fromEvent(lifetime.signal, 'abort');
    const seed = sandboxSeed(settings, empty);
    const state$: Observable<Sandbox> = merge(
        defer(() => inputs$),
        defer(() => state$).pipe(
            map(state => (state.clock.playing && !state.clock.held) || state.focus.running),
            distinctUntilChanged(),
            switchMap(running =>
                running
                    ? animationFrames().pipe(
                          pairwise(),
                          map(([a, b]): SandboxInput => ({
                              kind: 'advance',
                              ms: b.timestamp - a.timestamp,
                          })),
                      )
                    : EMPTY,
            ),
        ),
    ).pipe(
        scan(reduceSandbox, seed),
        startWith(seed),
        takeUntil(end$),
        shareReplay({ bufferSize: 1, refCount: true }),
    );
    const select = <T>(read: (state: Sandbox) => T): Observable<T> =>
        state$.pipe(map(read), distinctUntilChanged());
    const clock$ = select(state => state.clock);
    const app: AppState = {
        reading$: select(state => ({
            kind: 'count',
            title: 'Component catalogue',
            done: state.tickets.statuses
                .filter(status => status.stage === 'done')
                .flatMap(status => status.tickets).length,
            total: 3,
        })),
        plan$: of(null),
        playhead$: clock$.pipe(map(clock => clock.at)),
        playing$: clock$.pipe(map(clock => clock.playing)),
        looping$: clock$.pipe(map(clock => clock.looping)),
        duration$: clock$.pipe(map(clock => clock.duration)),
        ticks$: clock$.pipe(map(clock => clock.ticks)),
        clock$,
        zoom$: of(1),
        source$: id =>
            select(state => ({
                value: state.sources.get(id) ?? sourceOf(id, state.library),
                from: 'storybook-preview',
            })),
        theme$: name =>
            select(state => ({ value: state.themes.get(name) ?? themes[name], from: null })),
        error$: () => of(null),
        look$: select(state => state.look),
        library$: select(state => state.library),
        blueprints$: of({ items: [] }),
        tasks$: of(
            empty
                ? []
                : [
                      {
                          id: 'preview-note',
                          title: 'note',
                          icon: 'M5 4h14v16H5z',
                          ordinal: 1,
                          focused: true,
                      },
                      {
                          id: 'preview-tickets',
                          title: 'tickets',
                          icon: 'M4 6h16v12H4z',
                          ordinal: 1,
                          focused: false,
                      },
                  ],
        ),
        tickets$: select(state => state.tickets),
        notes$: select(state => state.notes),
        focus$: select(state => state.focus),
        agenda$: select(state => state.agenda),
        habits$: select(state => state.habits),
        clocks$: select(state => state.clocks),
        bookmarks$: select(state => state.bookmarks),
        signal$: select(state => state.signal),
        wave$: select(state => waveOf(new Map([['example', state.signal]]), 'example')),
        picture$: select(state => state.picture),
        drawing$: select(state => drawingOf(state.pen, new Map())),
        sounding$: of(soundingOf(defaultVoice, new Map())),
        kit$: of(kitOf(defaultDrums, new Map())),
        linkedPicture$: () => of(null),
        linkedDriver$: () => of(null),
        followedImage$: () => of(NONE),
        pedal$: of(defaultPedal('mix')),
        image$: of(NONE),
        gate$: of(GATE_DEFAULTS.switch),
        bits$: of(new Uint8Array(16)),
        linkedName$: () => of(null),
        followedSignal$: input =>
            empty || input !== 'a'
                ? of(null)
                : select(state => ({
                      id: 'example',
                      name: 'Sine',
                      colour: 'var(--accent)',
                      wave: waveOf(new Map([['example', state.signal]]), 'example'),
                  })),
        inspect$: () => select(state => state.tickets),
        history$: of(
            empty
                ? []
                : [
                      {
                          id: 1,
                          label: 'Created a ticket',
                          offset: -1,
                          taken: false,
                          takesBack: false,
                      },
                      { id: 2, label: 'Renamed a note', offset: 0, taken: false, takesBack: false },
                  ],
        ),
        graph$: of({
            stores: empty
                ? []
                : [
                      {
                          id: 'preview-tickets',
                          target: 'preview-tickets',
                          global: false,
                          program: 'tickets',
                          kind: 'tickets',
                          title: 'Tickets',
                          name: 'Example',
                          colour: 'var(--accent)',
                          ports: [],
                      },
                  ],
            windows: empty
                ? []
                : [
                      {
                          id: 'preview-window',
                          program: 'tickets',
                          label: 'Tickets',
                          icon: 'M4 6h16v12H4z',
                          own: 'preview-tickets',
                          ports: [],
                      },
                  ],
        }),
        appearance$: name =>
            select(state => ({
                value: state.appearances.get(name) ?? appearances[name],
                from: null,
            })),
    };
    const self: Self = {
        id: 'storybook-preview',
        slot$: of({
            frame: { x: 0, y: 0, z: 1, width: program.size.width, height: program.size.height },
            focused: true,
        }),
        store$: of('storybook-preview'),
        clock$: of(null),
        settings$: select(state => state.settings),
    };
    const inputs$: Observable<AppInput> = process.run$(app, self).pipe(takeUntil(end$), share());
    return {
        element: process.element,
        run$: state$.pipe(
            ignoreElements(),
            finalize(() => {
                lifetime.abort();
            }),
        ),
        events$: inputs$.pipe(map(input => recorded(input.kind, input))),
    };
};
