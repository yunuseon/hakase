import {
    normaliseTags,
    statusOf,
    ticketsIn,
    type Priority,
    type TicketCommand,
    type Tickets,
} from '../../shared/tickets.ts';

export type Draft = {
    readonly title: string;
    readonly description: string;
    readonly status: string | null;
    readonly priority: Priority;
    readonly tags: readonly string[];
    readonly parent: string | null;
    readonly blockedBy: readonly string[];
};

export type Creation = {
    readonly phase: 'closed' | 'editing' | 'submitted';
    readonly step: 0 | 1 | 2;
    readonly draft: Draft;
    readonly error: string;
};

export type CreationChange =
    | {
          readonly kind: 'open';
          readonly title: string;
          readonly status: string | null;
          readonly parent: string | null;
          readonly tags: readonly string[];
      }
    | { readonly kind: 'title'; readonly value: string }
    | { readonly kind: 'description'; readonly value: string }
    | { readonly kind: 'status'; readonly value: string }
    | { readonly kind: 'priority'; readonly value: Priority }
    | { readonly kind: 'tag'; readonly value: string }
    | { readonly kind: 'parent'; readonly value: string }
    | { readonly kind: 'blocker'; readonly value: string }
    | { readonly kind: 'advance' }
    | { readonly kind: 'back' }
    | { readonly kind: 'cancel' };

export const closedCreation: Creation = {
    phase: 'closed',
    step: 0,
    error: '',
    draft: {
        title: '',
        description: '',
        status: null,
        priority: 'none',
        tags: [],
        parent: null,
        blockedBy: [],
    },
};

const toggled = (items: readonly string[], value: string): readonly string[] =>
    items.includes(value) ? items.filter(item => item !== value) : [...items, value];

export const reduceCreation = (state: Creation, change: CreationChange): Creation => {
    if (change.kind === 'open') {
        return {
            ...closedCreation,
            phase: 'editing',
            draft: {
                ...closedCreation.draft,
                title: change.title,
                status: change.status,
                parent: change.parent,
                tags: normaliseTags(change.tags),
            },
        };
    }
    if (change.kind === 'cancel') {
        return closedCreation;
    }
    if (state.phase !== 'editing') {
        return state;
    }
    switch (change.kind) {
        case 'title':
            return { ...state, error: '', draft: { ...state.draft, title: change.value } };
        case 'description':
            return { ...state, draft: { ...state.draft, description: change.value } };
        case 'status':
            return { ...state, draft: { ...state.draft, status: change.value } };
        case 'priority':
            return { ...state, draft: { ...state.draft, priority: change.value } };
        case 'tag':
            return {
                ...state,
                draft: {
                    ...state.draft,
                    tags: normaliseTags(toggled(state.draft.tags, change.value)),
                },
            };
        case 'parent':
            return {
                ...state,
                draft: {
                    ...state.draft,
                    parent:
                        change.value === '' || state.draft.parent === change.value
                            ? null
                            : change.value,
                },
            };
        case 'blocker':
            return {
                ...state,
                draft: { ...state.draft, blockedBy: toggled(state.draft.blockedBy, change.value) },
            };
        case 'back':
            return { ...state, step: state.step === 2 ? 1 : 0, error: '' };
        case 'advance':
            return state.draft.title.trim() === ''
                ? { ...state, step: 0, error: 'Give your ticket a title.' }
                : state.step < 2
                  ? { ...state, step: state.step === 0 ? 1 : 2, error: '' }
                  : { ...state, phase: 'submitted', error: '' };
    }
};

export const creationCommand = ({ draft }: Creation): TicketCommand => ({ kind: 'add', ...draft });

export type CreatorView = {
    readonly state: Creation;
    readonly status: string;
    readonly statuses: readonly { readonly id: string; readonly title: string }[];
    readonly summary: readonly { readonly label: string; readonly value: string }[];
};

export const creatorView = (state: Creation, tickets: Tickets): CreatorView => {
    const { draft } = state;
    const label = (id: string | null): string => {
        const ticket = ticketsIn(tickets).find(ticket => ticket.id === id);
        return ticket === undefined ? 'None' : `#${ticket.number} ${ticket.title}`;
    };
    const status =
        tickets.statuses.find(status => status.id === draft.status) ??
        tickets.statuses.find(status => status.stage === 'open') ??
        tickets.statuses[0];
    return {
        state,
        status: status?.id ?? '',
        statuses: tickets.statuses,
        summary: [
            { label: 'Title', value: draft.title.trim() },
            { label: 'Status', value: status?.title ?? 'To do' },
            { label: 'Priority', value: draft.priority },
            { label: 'Tags', value: draft.tags.join(', ') || 'None' },
            { label: 'Parent', value: label(draft.parent) },
            {
                label: 'Blocked by',
                value:
                    draft.blockedBy
                        .map(id => `${label(id)} (${statusOf(tickets, id)?.title ?? ''})`)
                        .join(', ') || 'None',
            },
            { label: 'Description', value: draft.description || 'No description' },
        ],
    };
};
