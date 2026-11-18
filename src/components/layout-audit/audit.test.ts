import { describe, expect, it } from 'vitest';
import { auditView, findingsOf, jobsOf, type Box, type Measured } from './audit.ts';

const box = (left: number, top: number, right: number, bottom: number): Box => ({
    left,
    top,
    right,
    bottom,
});
const clean: Measured = { overflow: 0, probes: [], fields: [], scrollers: [] };

describe('the layout audit', () => {
    it('finds what a clipping parent cuts off, by how far', () => {
        const findings = findingsOf({
            ...clean,
            probes: [
                {
                    label: 'grid',
                    box: box(0, 170, 100, 190),
                    clip: box(0, 0, 220, 180),
                    hiddenText: 0,
                    ellipsis: false,
                },
                {
                    label: 'kept',
                    box: box(0, 0, 100, 20),
                    clip: box(0, 0, 220, 180),
                    hiddenText: 0,
                    ellipsis: false,
                },
                {
                    label: 'loose',
                    box: box(0, 900, 100, 920),
                    clip: null,
                    hiddenText: 0,
                    ellipsis: false,
                },
            ],
        });

        expect(findings).toEqual([{ kind: 'clipped', label: 'grid', by: 10 }]);
    });

    it('finds a field narrower than its value, sideways scroll that was not meant, and a window that scrolls', () => {
        const findings = findingsOf({
            overflow: 64,
            probes: [
                {
                    label: 'title',
                    box: box(0, 0, 10, 10),
                    clip: null,
                    hiddenText: 0,
                    ellipsis: true,
                },
            ],
            fields: [
                {
                    label: 'threshold',
                    box: box(0, 0, 44, 20),
                    clip: null,
                    hiddenText: 3,
                    ellipsis: false,
                },
            ],
            scrollers: [
                { label: 'chips', sideways: 40, intentional: false },
                { label: 'steps', sideways: 400, intentional: true },
            ],
        });

        expect(findings.map(({ kind, label }) => `${kind} ${label}`)).toEqual([
            'field threshold',
            'sideways chips',
            'scrolls the window',
            'cut title',
        ]);
    });

    it('measures each program at its minimum, compact and regular size, once each', () => {
        const jobs = jobsOf([
            {
                id: 'note',
                title: 'note',
                size: { width: 300, height: 320 },
                minimum: { width: 200, height: 180 },
            },
            {
                id: 'sketch',
                title: 'sketch',
                size: { width: 640, height: 820 },
                minimum: { width: 320, height: 420 },
            },
            {
                id: 'nand',
                title: 'nand',
                size: { width: 104, height: 64 },
                minimum: { width: 104, height: 64 },
            },
        ]);

        expect(
            jobs.map(
                ({ program, size, extent }) =>
                    `${program} ${size} ${extent.width}x${extent.height}`,
            ),
        ).toEqual([
            'note minimum 200x180',
            'note compact 240x320',
            'note regular 300x320',
            'sketch minimum 320x420',
            'sketch compact 320x820',
            'sketch regular 640x820',
            'nand minimum 104x64',
        ]);
    });

    it('ranks programs by what fails, and counts a cut title apart', () => {
        const job = {
            title: 'x',
            size: 'minimum' as const,
            extent: { width: 1, height: 1 },
            sizeClass: 'glance' as const,
        };
        const view = auditView(
            [
                { ...job, program: 'a', findings: [{ kind: 'cut', label: 't', by: 0 }] },
                {
                    ...job,
                    program: 'b',
                    findings: [
                        { kind: 'clipped', label: 'c', by: 4 },
                        { kind: 'scrolls', label: 'w', by: 9 },
                    ],
                },
            ],
            4,
        );

        expect(view.rows.map(({ program, failing }) => [program, failing])).toEqual([
            ['b', 2],
            ['a', 0],
        ]);
        expect([view.running, view.failing, view.broken, view.totals.cut]).toEqual([true, 2, 1, 1]);
    });
});
