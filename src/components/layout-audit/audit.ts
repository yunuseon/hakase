import { sizeClassOf, type SizeClass } from '../../layout/size-class.ts';

export type Box = {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
};

export type Probe = {
    readonly label: string;
    readonly box: Box;
    readonly clip: Box | null;
    readonly hiddenText: number;
    readonly ellipsis: boolean;
};

export type Scroller = {
    readonly label: string;
    readonly sideways: number;
    readonly intentional: boolean;
};

export type Measured = {
    readonly overflow: number;
    readonly probes: readonly Probe[];
    readonly fields: readonly Probe[];
    readonly scrollers: readonly Scroller[];
};

export const FAILING = ['clipped', 'field', 'sideways', 'scrolls'] as const;
export const KINDS = [...FAILING, 'cut'] as const;
export type Kind = (typeof KINDS)[number];
export type Finding = { readonly kind: Kind; readonly label: string; readonly by: number };

const SLACK = 1;

const outside = (box: Box, clip: Box): number =>
    Math.max(
        clip.left - box.left,
        box.right - clip.right,
        clip.top - box.top,
        box.bottom - clip.bottom,
        0,
    );

export const findingsOf = ({ overflow, probes, fields, scrollers }: Measured): Finding[] => [
    ...probes.flatMap(({ label, box, clip }): Finding[] => {
        const by = clip === null ? 0 : outside(box, clip);

        return by > SLACK ? [{ kind: 'clipped', label, by: Math.round(by) }] : [];
    }),
    ...fields.flatMap(({ label, hiddenText }): Finding[] =>
        hiddenText > SLACK ? [{ kind: 'field', label, by: Math.round(hiddenText) }] : [],
    ),
    ...scrollers.flatMap(({ label, sideways, intentional }): Finding[] =>
        !intentional && sideways > SLACK
            ? [{ kind: 'sideways', label, by: Math.round(sideways) }]
            : [],
    ),
    ...(overflow > SLACK
        ? [{ kind: 'scrolls' as const, label: 'the window', by: Math.round(overflow) }]
        : []),
    ...probes.flatMap(({ label, ellipsis }): Finding[] =>
        ellipsis ? [{ kind: 'cut', label, by: 0 }] : [],
    ),
];

export const SIZES = ['minimum', 'compact', 'regular'] as const;
export type SizeName = (typeof SIZES)[number];
export type Extent = { readonly width: number; readonly height: number };

export type Job = {
    readonly program: string;
    readonly title: string;
    readonly size: SizeName;
    readonly extent: Extent;
    readonly sizeClass: SizeClass;
};

export const COMPACT_WIDTH = 240;

export const jobsOf = (
    programs: readonly {
        readonly id: string;
        readonly title: string;
        readonly size: Extent;
        readonly minimum: Extent;
    }[],
): readonly Job[] =>
    programs.flatMap(({ id, title, size, minimum }) => {
        const extents: Readonly<Record<SizeName, Extent>> = {
            minimum,
            compact: {
                width: Math.max(minimum.width, Math.min(size.width, COMPACT_WIDTH)),
                height: size.height,
            },
            regular: size,
        };

        return SIZES.flatMap((name, index): Job[] => {
            const extent = extents[name];
            const repeated = SIZES.slice(0, index).some(
                earlier =>
                    extents[earlier].width === extent.width &&
                    extents[earlier].height === extent.height,
            );

            return repeated
                ? []
                : [{ program: id, title, size: name, extent, sizeClass: sizeClassOf(extent) }];
        });
    });

export type Result = Job & { readonly findings: readonly Finding[] };

export type AuditRow = {
    readonly program: string;
    readonly title: string;
    readonly failing: number;
    readonly sizes: readonly {
        readonly size: SizeName;
        readonly sizeClass: SizeClass;
        readonly extent: string;
        readonly counts: Readonly<Record<Kind, number>>;
        readonly findings: readonly Finding[];
    }[];
};

export type AuditView = {
    readonly running: boolean;
    readonly done: number;
    readonly total: number;
    readonly failing: number;
    readonly programs: number;
    readonly broken: number;
    readonly totals: Readonly<Record<Kind, number>>;
    readonly rows: readonly AuditRow[];
};

const countsOf = (findings: readonly Finding[]): Readonly<Record<Kind, number>> => ({
    clipped: findings.filter(({ kind }) => kind === 'clipped').length,
    field: findings.filter(({ kind }) => kind === 'field').length,
    sideways: findings.filter(({ kind }) => kind === 'sideways').length,
    scrolls: findings.filter(({ kind }) => kind === 'scrolls').length,
    cut: findings.filter(({ kind }) => kind === 'cut').length,
});

const failingIn = (findings: readonly Finding[]): number =>
    findings.filter(({ kind }) => kind !== 'cut').length;

export const auditView = (results: readonly Result[], total: number): AuditView => {
    const programs = [...new Set(results.map(({ program }) => program))];
    const rows = programs
        .map((program): AuditRow => {
            const own = results.filter(result => result.program === program);

            return {
                program,
                title: own[0]?.title ?? program,
                failing: own.reduce((sum, { findings }) => sum + failingIn(findings), 0),
                sizes: own.map(({ size, sizeClass, extent, findings }) => ({
                    size,
                    sizeClass,
                    extent: `${extent.width} × ${extent.height}`,
                    counts: countsOf(findings),
                    findings,
                })),
            };
        })
        .sort((a, b) => b.failing - a.failing || a.title.localeCompare(b.title));
    const all = results.flatMap(({ findings }) => findings);

    return {
        running: results.length < total && total > 0,
        done: results.length,
        total,
        failing: failingIn(all),
        programs: rows.length,
        broken: rows.filter(({ failing }) => failing > 0).length,
        totals: countsOf(all),
        rows,
    };
};
