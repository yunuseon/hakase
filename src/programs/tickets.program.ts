import { combineLatest, merge } from 'rxjs';
import {
    distinctUntilChanged,
    ignoreElements,
    map,
    filter,
    scan,
    pairwise,
    mergeMap,
    shareReplay,
    startWith,
    withLatestFrom,
} from 'rxjs/operators';
import { commandInView, sameTickets, ticketView } from '../shared/tickets.ts';
import {
    closedCreation,
    creationCommand,
    creatorView,
    reduceCreation,
    type CreationChange,
} from '../components/ticket-creator/ticket-creator.ts';
import { detailPickers, draftPickers } from '../ticket-pickers.ts';
import type { AppInput, Program } from '../program.ts';
import { asTickets } from '../settings.ts';

export const ticketsProgram = {
    id: 'tickets',
    inputs: {},
    title: 'tickets',
    category: 'plan',
    icon: 'M4 6.5 H20 V10 A2 2 0 0 0 20 14 V17.5 H4 V14 A2 2 0 0 0 4 10 Z M9.5 6.5 V17.5',
    size: { width: 360, height: 420 },
    minimum: { width: 240, height: 220 },
    launch: async () => {
        const [{ HksTickets }, { HksSearchPicker }, { HksTicketCreator }] = await Promise.all([
            import('../components/tickets/tickets.component.ts'),
            import('../components/search-picker/search-picker.component.ts'),
            import('../components/ticket-creator/ticket-creator.component.ts'),
        ]);
        const tickets = new HksTickets();
        const creator = new HksTicketCreator();
        creator.slot = 'creator';
        const tags = new HksSearchPicker();
        tags.slot = 'tags';
        const parent = new HksSearchPicker();
        parent.slot = 'parent';
        const blockers = new HksSearchPicker();
        blockers.slot = 'blockers';
        creator.append(tags, parent, blockers);
        const detailParent = new HksSearchPicker();
        detailParent.slot = 'parent';
        const detailBlockers = new HksSearchPicker();
        detailBlockers.slot = 'blocker';
        tickets.append(creator, detailParent, detailBlockers);

        return {
            element: tickets,
            run$: ({ tickets$ }, self) => {
                const document$ = tickets$.pipe(distinctUntilChanged(sameTickets));
                const filter$ = tickets.filters$.pipe(startWith(null), distinctUntilChanged());
                const screen$ = combineLatest([
                    document$,
                    filter$,
                    tickets.searches$.pipe(startWith(''), distinctUntilChanged()),
                ]).pipe(
                    map(([document, tag, query]) => ticketView(document, tag, query)),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                const creation$ = merge(
                    tickets.creations$.pipe(
                        withLatestFrom(screen$),
                        map(([seed, screen]): CreationChange => ({
                            kind: 'open',
                            ...seed,
                            tags: screen.filter === null ? [] : [screen.filter],
                        })),
                    ),
                    creator.changes$,
                    tags.picks$.pipe(map((value): CreationChange => ({ kind: 'tag', value }))),
                    parent.picks$.pipe(map((value): CreationChange => ({ kind: 'parent', value }))),
                    blockers.picks$.pipe(
                        map((value): CreationChange => ({ kind: 'blocker', value })),
                    ),
                    self.store$.pipe(
                        distinctUntilChanged(),
                        pairwise(),
                        map((): CreationChange => ({ kind: 'cancel' })),
                    ),
                ).pipe(
                    scan(reduceCreation, closedCreation),
                    startWith(closedCreation),
                    distinctUntilChanged(),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const creating$ = combineLatest([creation$, document$]).pipe(
                    map(([state, document]) => ({
                        view: creatorView(state, document),
                        pickers: draftPickers(document, state.draft),
                    })),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const details$ = combineLatest([document$, tickets.selected$]).pipe(
                    map(([document, id]) => detailPickers(document, id)),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                return merge(
                    creator
                        .connect$(creating$.pipe(map(screen => screen.view)))
                        .pipe(ignoreElements()),
                    tags
                        .connect$(creating$.pipe(map(screen => screen.pickers.tags)))
                        .pipe(ignoreElements()),
                    parent
                        .connect$(creating$.pipe(map(screen => screen.pickers.parent)))
                        .pipe(ignoreElements()),
                    blockers
                        .connect$(creating$.pipe(map(screen => screen.pickers.blockers)))
                        .pipe(ignoreElements()),
                    detailParent
                        .connect$(details$.pipe(map(screen => screen.parent)))
                        .pipe(ignoreElements()),
                    detailBlockers
                        .connect$(details$.pipe(map(screen => screen.blockers)))
                        .pipe(ignoreElements()),
                    creation$.pipe(
                        filter(state => state.phase === 'submitted'),
                        map((state): AppInput => ({
                            kind: 'ticket',
                            command: creationCommand(state),
                        })),
                    ),
                    detailParent.picks$.pipe(
                        withLatestFrom(details$),
                        mergeMap(([value, screen]): AppInput[] =>
                            screen.ticket === undefined
                                ? []
                                : [
                                      {
                                          kind: 'ticket',
                                          command: {
                                              kind: 'nest',
                                              id: screen.ticket.id,
                                              parent:
                                                  value === '' || value === screen.ticket.parent
                                                      ? null
                                                      : value,
                                          },
                                      },
                                  ],
                        ),
                    ),
                    detailBlockers.picks$.pipe(
                        withLatestFrom(details$),
                        mergeMap(([value, screen]): AppInput[] =>
                            screen.ticket === undefined || value === ''
                                ? []
                                : [
                                      {
                                          kind: 'ticket',
                                          command: {
                                              kind: screen.ticket.blockedBy.includes(value)
                                                  ? 'unblock'
                                                  : 'block',
                                              id: screen.ticket.id,
                                              by: value,
                                          },
                                      },
                                  ],
                        ),
                    ),
                    tickets
                        .connect$(
                            screen$,
                            self.settings$.pipe(
                                map(settings => asTickets(settings).view),
                                distinctUntilChanged(),
                            ),
                        )
                        .pipe(ignoreElements()),
                    tickets.commands$.pipe(
                        withLatestFrom(screen$),
                        mergeMap(([command, screen]) => {
                            const applied = commandInView(screen, command);

                            return applied === null ? [] : [applied];
                        }),
                        map((command): AppInput => ({ kind: 'ticket', command })),
                    ),
                    tickets.views$.pipe(
                        map((view): AppInput => ({
                            kind: 'settings',
                            settings: { kind: 'tickets', view },
                        })),
                    ),
                );
            },
        };
    },
} satisfies Program;
