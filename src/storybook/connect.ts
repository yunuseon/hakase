import { catchError, defer, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    ignoreElements,
    map,
    scan,
    share,
    shareReplay,
    startWith,
    switchMap,
} from 'rxjs/operators';
import type { HksStorybook } from '../components/storybook/storybook.component.ts';
import {
    bookView,
    emptyLog,
    initialBook,
    reduceBook,
    reduceEventLog,
    sameArgs,
    type LogChange,
    type StoryEvent,
} from '../components/storybook/storybook.ts';
import { variables } from '../appearance.ts';
import { appearances, isAppearanceName } from '../appearances.ts';
import type { AppState } from '../program.ts';
import type { Story } from './story.ts';
import { recorded } from './story.ts';
import { HksPreviewError } from '../components/storybook/preview-error.component.ts';
import { stories } from './stories.ts';

type SessionMessage =
    | { readonly kind: 'mount'; readonly element: HTMLElement }
    | { readonly kind: 'event'; readonly event: StoryEvent };
export const connectBook$ = (
    book: HksStorybook,
    state: Pick<AppState, 'look$' | 'appearance$'>,
    catalogue: readonly Story[] = stories,
): Observable<never> => {
    const looks = [
        { value: 'inherit', label: 'Current' },
        ...Object.keys(appearances).map(value => ({
            value,
            label: value.charAt(0).toUpperCase() + value.slice(1),
        })),
    ];
    const changes$ = book.changes$.pipe(share());
    const seed = initialBook(catalogue);
    const model$ = changes$.pipe(
        scan((model, change) => reduceBook(model, change, catalogue), seed),
        startWith(seed),
        distinctUntilChanged(),
        shareReplay({ bufferSize: 1, refCount: true }),
    );
    const args$ = model$.pipe(
        map(model => model.args),
        distinctUntilChanged(sameArgs),
        shareReplay({ bufferSize: 1, refCount: true }),
    );
    const sessions$: Observable<SessionMessage> = model$.pipe(
        map(model => ({
            selected: model.selected,
            variant: model.variant,
            revision: model.revision,
        })),
        distinctUntilChanged(
            (a, b) =>
                a.selected === b.selected && a.variant === b.variant && a.revision === b.revision,
        ),
        switchMap(selection =>
            defer(() => {
                const story = catalogue.find(item => item.id === selection.selected);
                if (story === undefined) {
                    return of();
                }
                const demo = story.create({
                    args$,
                    variant: selection.variant,
                    actions$: changes$.pipe(
                        filter(change => change.kind === 'action'),
                        map(() => undefined),
                    ),
                });
                return merge(
                    of<SessionMessage>({ kind: 'mount', element: demo.element }),
                    demo.run$.pipe(ignoreElements()),
                    demo.events$.pipe(map((event): SessionMessage => ({ kind: 'event', event }))),
                );
            }).pipe(
                catchError((error: unknown) => {
                    const message = error instanceof Error ? error.message : String(error);
                    const element = new HksPreviewError(message);
                    return merge(
                        of<SessionMessage>({ kind: 'mount', element }),
                        of<SessionMessage>({ kind: 'event', event: recorded('error', message) }),
                        element.lifetime$,
                    );
                }),
            ),
        ),
        shareReplay({ bufferSize: 1, refCount: true }),
    );
    const events$ = merge(
        sessions$.pipe(
            map((message): LogChange =>
                message.kind === 'mount'
                    ? { kind: 'reset' }
                    : { kind: 'event', event: message.event },
            ),
        ),
        changes$.pipe(
            filter(change => change.kind === 'clear'),
            map((): LogChange => ({ kind: 'reset' })),
        ),
    ).pipe(
        scan(reduceEventLog, emptyLog),
        startWith(emptyLog),
        map(log => log.entries),
    );
    const appearance$ = model$.pipe(
        map(model => model.appearance),
        distinctUntilChanged(),
        switchMap(name => (isAppearanceName(name) ? of(name) : state.look$)),
        switchMap(name => state.appearance$(name)),
        map(written => variables(written.value)),
    );
    return book
        .connect$(
            model$.pipe(map(model => bookView(model, catalogue, looks))),
            sessions$.pipe(
                filter(message => message.kind === 'mount'),
                map(message => message.element),
            ),
            events$,
            appearance$,
        )
        .pipe(ignoreElements());
};
