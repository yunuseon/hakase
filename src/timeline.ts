export const OPENED = 'Opened the app';

const LIMIT = 100;

// Owned: what made its step. Not: what only followed it, like a raise or a pan, kept even when the step is taken back.
export type Logged<A> = { readonly seq: number; readonly action: A; readonly owned: boolean };

export type Step<D, A> = {
    readonly id: number;
    readonly key: string;
    readonly label: string;
    readonly actions: readonly Logged<A>[];
    readonly after: D;
    readonly takes: number | null;
};

export type Timeline<D, A> = {
    readonly base: D;
    readonly steps: readonly Step<D, A>[];
    readonly cursor: number;
    readonly present: D;
    readonly seq: number;
    readonly joining: string | null;
};

export type StepKind =
    | { readonly key: string; readonly joins: boolean }
    | { readonly key: null; readonly breaks: boolean };

export type Kit<D, A> = {
    readonly reduce: (state: D, action: A, seq: number) => D;
    readonly settled: (action: A, before: D) => A;
    readonly stepOf: (action: A, before: D) => StepKind;
    readonly labelOf: (action: A, before: D) => string;
    readonly kept: (restored: D, current: D) => D;
};

export const startTimeline = <D, A>(present: D, seq: number): Timeline<D, A> => ({
    base: present,
    steps: [],
    cursor: 0,
    present,
    seq,
    joining: null,
});

const afterAt = <D, A>(timeline: Timeline<D, A>, count: number) =>
    count === 0 ? timeline.base : (timeline.steps[count - 1]?.after ?? timeline.base);

const takenBy = <D, A>(steps: readonly Step<D, A>[]) =>
    new Set(steps.flatMap(({ takes }) => (takes === null ? [] : [takes])));

// Oldest first, but never between a step and the step that took it back, or a replay would lose one half.
const compacted = <D, A>(timeline: Timeline<D, A>): Timeline<D, A> => {
    if (timeline.steps.length <= LIMIT) {
        return timeline;
    }

    const span = (count: number): number => {
        const head = new Set(timeline.steps.slice(0, count).map(({ id }) => id));
        const reach = timeline.steps.reduce(
            (last, { takes }, index) => (takes !== null && head.has(takes) ? index : last),
            -1,
        );

        return reach >= count ? span(reach + 1) : count;
    };
    const count = span(1);

    return compacted({
        ...timeline,
        base: afterAt(timeline, count),
        steps: timeline.steps.slice(count),
        cursor: timeline.cursor - count,
    });
};

export const logged =
    <D, A>(kit: Kit<D, A>) =>
    (timeline: Timeline<D, A>, made: A): Timeline<D, A> => {
        const { present, cursor, steps } = timeline;
        const seq = timeline.seq + 1;
        const action = kit.settled(made, present);
        const next = kit.reduce(present, action, seq);
        const kind = kit.stepOf(action, present);
        const entry = { seq, action, owned: kind.key !== null };

        if (kind.key === null) {
            const joining = kind.breaks ? null : timeline.joining;
            const last = steps[cursor - 1];

            if (next === present) {
                return joining === timeline.joining ? timeline : { ...timeline, joining };
            }

            return last === undefined
                ? { ...timeline, base: next, present: next, seq, joining }
                : {
                      ...timeline,
                      steps: steps.map((step, index) =>
                          index === cursor - 1
                              ? { ...step, actions: [...step.actions, entry], after: next }
                              : step,
                      ),
                      present: next,
                      seq,
                      joining,
                  };
        }

        // Refused: no step, or undo would have one that does nothing.
        if (next === present) {
            return timeline;
        }

        const last = steps[cursor - 1];

        if (kind.joins && kind.key === timeline.joining && last !== undefined) {
            return {
                ...timeline,
                steps: steps.map((step, index) =>
                    index === cursor - 1
                        ? { ...step, actions: [...step.actions, entry], after: next }
                        : step,
                ),
                present: next,
                seq,
            };
        }

        return compacted({
            ...timeline,
            steps: [
                ...steps.slice(0, cursor),
                {
                    id: seq,
                    key: kind.key,
                    label: kit.labelOf(action, present),
                    actions: [entry],
                    after: next,
                    takes: null,
                },
            ],
            cursor: cursor + 1,
            present: next,
            seq,
            joining: kind.key,
        });
    };

export const undone =
    <D, A>(kit: Kit<D, A>) =>
    (timeline: Timeline<D, A>): Timeline<D, A> =>
        timeline.cursor === 0
            ? timeline
            : {
                  ...timeline,
                  cursor: timeline.cursor - 1,
                  present: kit.kept(afterAt(timeline, timeline.cursor - 1), timeline.present),
                  joining: null,
              };

export const redone =
    <D, A>(kit: Kit<D, A>) =>
    (timeline: Timeline<D, A>): Timeline<D, A> =>
        timeline.cursor === timeline.steps.length
            ? timeline
            : {
                  ...timeline,
                  cursor: timeline.cursor + 1,
                  present: kit.kept(afterAt(timeline, timeline.cursor + 1), timeline.present),
                  joining: null,
              };

// As many undos or redos in a row, so a jump lands exactly where pressing ⌘Z that often would.
export const travelled =
    <D, A>(kit: Kit<D, A>) =>
    (timeline: Timeline<D, A>, offset: number): Timeline<D, A> => {
        const target = Math.max(0, Math.min(timeline.steps.length, timeline.cursor + offset));

        return target === timeline.cursor
            ? timeline
            : {
                  ...timeline,
                  cursor: target,
                  present: kit.kept(afterAt(timeline, target), timeline.present),
                  joining: null,
              };
    };

export const takenBack =
    <D, A>(kit: Kit<D, A>) =>
    (timeline: Timeline<D, A>, id: number): Timeline<D, A> => {
        const applied = timeline.steps.slice(0, timeline.cursor);
        const target = applied.find(step => step.id === id);
        const taken = takenBy(applied);

        if (target === undefined || target.takes !== null || taken.has(id)) {
            return timeline;
        }

        const skipped = new Set([...taken, id]);
        const from = applied.findIndex(step => skipped.has(step.id));
        const replayed = applied
            .slice(from)
            .flatMap(step =>
                skipped.has(step.id) ? step.actions.filter(({ owned }) => !owned) : step.actions,
            )
            .reduce(
                (state, { seq, action }) => kit.reduce(state, action, seq),
                afterAt(timeline, from),
            );
        const seq = timeline.seq + 1;
        const after = kit.kept(replayed, timeline.present);

        return compacted({
            ...timeline,
            steps: [
                ...applied,
                {
                    id: seq,
                    key: 'take-back',
                    label: `Took back “${target.label}”`,
                    actions: [],
                    after,
                    takes: id,
                },
            ],
            cursor: applied.length + 1,
            present: after,
            seq,
            joining: null,
        });
    };

export type Entry = {
    readonly id: number;
    readonly label: string;
    readonly offset: number;
    readonly taken: boolean;
    readonly takesBack: boolean;
};

export const entriesOf = <D, A>({ steps, cursor }: Timeline<D, A>): readonly Entry[] => {
    const taken = takenBy(steps.slice(0, cursor));

    return [
        { id: 0, label: OPENED, offset: -cursor, taken: false, takesBack: false },
        ...steps.map((step, index) => ({
            id: step.id,
            label: step.label,
            offset: index + 1 - cursor,
            taken: taken.has(step.id),
            takesBack: step.takes !== null,
        })),
    ];
};
