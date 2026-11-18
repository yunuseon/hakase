import { concat, EMPTY, from, merge, Observable, of, timer } from 'rxjs';
import {
    catchError,
    concatMap,
    delay,
    exhaustMap,
    filter,
    map,
    mergeMap,
    scan,
    share,
    shareReplay,
    startWith,
    take,
    withLatestFrom,
} from 'rxjs/operators';
import { HksLayoutAudit } from '../components/layout-audit/layout-audit.component.ts';
import {
    auditView,
    findingsOf,
    jobsOf,
    type Box,
    type Job,
    type Measured,
    type Probe,
    type Result,
    type Scroller,
} from '../components/layout-audit/audit.ts';
import { programList } from '../programs.ts';
import { programDemo } from './program-demo.ts';
import { defaults, recorded, type Story } from './story.ts';

const SETTLE_MS = 400;

type Audit = { readonly started: boolean; readonly results: readonly Result[] };

const idle: Audit = { started: false, results: [] };
const GIVE_UP_MS = 5000;

const boxOf = (element: Element): Box => {
    const { left, top, right, bottom } = element.getBoundingClientRect();

    return { left, top, right, bottom };
};

const parentOf = (element: Element): Element | null => {
    const root = element.getRootNode();

    return (
        element.assignedSlot ??
        element.parentElement ??
        (root instanceof ShadowRoot ? root.host : null)
    );
};

const within = (root: Element): Element[] =>
    [...root.children, ...(root.shadowRoot?.children ?? [])].flatMap(child => [
        child,
        ...within(child),
    ]);

const shown = (element: Element): boolean => {
    const { width, height } = element.getBoundingClientRect();

    return width >= 1 && height >= 1 && getComputedStyle(element).visibility !== 'hidden';
};

const labelOf = (element: Element): string => {
    const text = (
        element.getAttribute('aria-label') ??
        element.getAttribute('data-field') ??
        element.getAttribute('placeholder') ??
        element.textContent ??
        ''
    )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 28);
    const kind = element.classList[0];

    return `${element.localName}${kind === undefined ? '' : `.${kind}`}${text === '' ? '' : ` "${text}"`}`;
};

const CONTROLS = /^(input|button|textarea|select|hks-select|output|canvas)$/;
const SCROLLS = /^(auto|scroll)$/;
const CLIPS = /^(hidden|clip)$/;

const said = (element: Element): boolean =>
    CONTROLS.test(element.localName) ||
    [...element.childNodes].some(
        node => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
    );

const clipOf = (element: Element, body: Element): Box | null => {
    const parent = parentOf(element);

    if (parent === null || parent === body) {
        return null;
    }

    const { overflowX, overflowY } = getComputedStyle(parent);

    return parent.hasAttribute('data-scrolls') || SCROLLS.test(overflowX) || SCROLLS.test(overflowY)
        ? null
        : CLIPS.test(overflowX) || CLIPS.test(overflowY)
          ? boxOf(parent)
          : clipOf(parent, body);
};

const probeOf = (element: Element, body: Element): Probe => ({
    label: labelOf(element),
    box: boxOf(element),
    clip: clipOf(element, body),
    hiddenText:
        element instanceof HTMLInputElement && /^(text|number|search)$/.test(element.type)
            ? element.scrollWidth - element.clientWidth
            : 0,
    ellipsis:
        getComputedStyle(element).textOverflow === 'ellipsis' &&
        element.scrollWidth > element.clientWidth + 1,
});

const scrollerOf = (element: Element): Scroller[] =>
    SCROLLS.test(getComputedStyle(element).overflowX) &&
    element.scrollWidth > element.clientWidth &&
    element.clientWidth > 0
        ? [
              {
                  label: labelOf(element),
                  sideways: element.scrollWidth - element.clientWidth,
                  intentional: element.hasAttribute('data-scrolls'),
              },
          ]
        : [];

const measuredIn = (content: Element): Measured | null => {
    const body = content.assignedSlot?.parentElement ?? null;

    if (body === null) {
        return null;
    }

    const elements = within(content).filter(shown);
    const program = content.firstElementChild;
    const own =
        program !== null && SCROLLS.test(getComputedStyle(program).overflowY)
            ? program.scrollHeight - program.clientHeight
            : 0;

    return {
        overflow: Math.max(body.scrollHeight - body.clientHeight, own),
        probes: elements.filter(said).map(element => probeOf(element, body)),
        fields: elements
            .filter(element => element instanceof HTMLInputElement)
            .map(element => probeOf(element, body)),
        scrollers: [body, ...elements].flatMap(scrollerOf),
    };
};

const audited$ = (host: HksLayoutAudit, job: Job): Observable<Result> =>
    new Observable<Result>(subscriber => {
        const program = programList.find(({ id }) => id === job.program);

        if (program === undefined) {
            subscriber.complete();
            return undefined;
        }

        const demo = programDemo(program, undefined);
        demo.element.slot = 'stage';
        host.append(demo.element);
        const running = merge(demo.run$, demo.events$)
            .pipe(catchError(() => EMPTY))
            .subscribe();
        const waiting = merge(
            timer(0, 50).pipe(
                filter(() => demo.element.childElementCount > 0),
                take(1),
                delay(SETTLE_MS),
                map((): Result => {
                    const measured = measuredIn(demo.element);

                    return { ...job, findings: measured === null ? [] : findingsOf(measured) };
                }),
            ),
            timer(GIVE_UP_MS).pipe(
                map((): Result => ({
                    ...job,
                    findings: [{ kind: 'clipped', label: 'never mounted', by: 0 }],
                })),
            ),
        )
            .pipe(take(1))
            .subscribe(subscriber);

        return () => {
            waiting.unsubscribe();
            running.unsubscribe();
            demo.element.remove();
        };
    });

export const auditStories: readonly Story[] = [
    {
        id: 'layout-audit',
        title: 'Layout audit',
        group: 'Foundations',
        description:
            'Every program rendered at its minimum, compact and regular size in a window-shaped frame, with what does not fit: controls clipped, fields narrower than their value, sideways scroll that was not meant, a window that has to scroll, and text cut short.',
        elements: ['hks-layout-audit'],
        variants: [{ id: 'all', title: 'All programs' }],
        controls: [],
        defaults,
        height: 640,
        code: '// A scroller that is meant to scroll sideways (a step grid, a date strip) says so:\n<div class="grid" data-scrolls>…</div>\n// Findings are pure: findingsOf(measured) in components/layout-audit/audit.ts.',
        action: 'Run audit',
        create: ({ actions$ }) => {
            const element = new HksLayoutAudit();
            const jobs = jobsOf(programList.filter(({ id }) => id !== 'storybook'));
            const steps$ = actions$.pipe(
                exhaustMap(() =>
                    concat(
                        of({ kind: 'start' as const }),
                        from(jobs).pipe(
                            concatMap(job =>
                                concat(
                                    of({ kind: 'job' as const, job }),
                                    audited$(element, job).pipe(
                                        map(result => ({ kind: 'result' as const, result })),
                                    ),
                                ),
                            ),
                        ),
                        of({ kind: 'end' as const }),
                    ),
                ),
                share(),
            );
            const audit$ = steps$.pipe(
                scan(
                    (audit: Audit, step): Audit =>
                        step.kind === 'start'
                            ? { started: true, results: [] }
                            : step.kind === 'result'
                              ? { ...audit, results: [...audit.results, step.result] }
                              : audit,
                    idle,
                ),
                startWith(idle),
                shareReplay({ bufferSize: 1, refCount: true }),
            );

            return {
                element,
                run$: element.connect$(
                    audit$.pipe(
                        map(({ started, results }) =>
                            auditView(results, started ? jobs.length : 0),
                        ),
                    ),
                    steps$.pipe(
                        mergeMap(step =>
                            step.kind === 'job'
                                ? of(step.job.extent)
                                : step.kind === 'end'
                                  ? of(null)
                                  : EMPTY,
                        ),
                    ),
                ),
                events$: steps$.pipe(
                    filter(step => step.kind === 'end'),
                    withLatestFrom(audit$),
                    map(([, { results }]) =>
                        recorded('audited', { failing: auditView(results, jobs.length).failing }),
                    ),
                ),
            };
        },
    },
];
