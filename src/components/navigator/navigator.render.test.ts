import { afterEach, describe, expect, it } from 'vitest';
import { fromEvent, merge, of } from 'rxjs';
import { map, scan, startWith, tap } from 'rxjs/operators';
import { HksNavigator } from './navigator.component.ts';
import { requireChild, requireElement } from '../../lib/dom.ts';
import type { MiniMap } from './navigator.ts';

const example: MiniMap = {
    windows: [{ x: 40, y: 45, width: 70, height: 55 }],
    sections: [{ id: 'make', name: 'Make', rect: { x: 25, y: 20, width: 160, height: 120 } }],
    view: { x: 16, y: 12, width: 190, height: 150 },
};
afterEach(() => document.body.replaceChildren());
describe('unified navigator card', () => {
    it('keeps a live compact map and preserves commands through expand/collapse', () => {
        const element = new HksNavigator();
        document.body.append(element);
        const root = element.shadowRoot ?? element;
        const events: string[] = [];
        const open$ = element.toggles$.pipe(
            scan(open => !open, false),
            startWith(false),
        );
        const running = merge(
            element.connect$(
                of(example),
                of('72%'),
                open$,
                of({ undo: true, redo: false }),
                of(true),
            ),
            element.zooms$.pipe(tap(value => events.push(value))),
            element.edits$.pipe(tap(value => events.push(value))),
            element.jumps$.pipe(tap(value => events.push(value))),
            element.adds$.pipe(tap(() => events.push('add'))),
            element.modes$.pipe(tap(() => events.push('mode'))),
        ).subscribe();
        const toggle = requireElement(root, '.toggle', HTMLButtonElement);
        const scene = root.querySelector('.miniature');
        expect(root.querySelector('.window')?.namespaceURI).toBe('http://www.w3.org/2000/svg');
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(requireChild(root, '.readout').textContent).toBe('72%');
        requireElement(root, '.readout', HTMLButtonElement).click();
        toggle.focus();
        toggle.click();
        expect(element.shadowRoot?.activeElement).toBe(root.querySelector('[data-jump="make"]'));
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(element.hasAttribute('data-open')).toBe(true);
        expect(root.querySelector('.miniature')).toBe(scene);
        for (const value of ['out', 'in', 'fit']) {
            requireElement(root, `[data-zoom="${value}"]`, HTMLButtonElement).click();
        }
        requireElement(root, '[data-edit="undo"]', HTMLButtonElement).click();
        requireElement(root, '[data-edit="redo"]', HTMLButtonElement).click();
        requireElement(root, '[data-jump="make"]', HTMLButtonElement).click();
        requireElement(root, '.add', HTMLButtonElement).click();
        requireElement(root, '.state-mode', HTMLButtonElement).click();
        expect(events).toEqual(['reset', 'out', 'in', 'fit', 'undo', 'make', 'add', 'mode']);
        expect(requireChild(root, '.state-mode').getAttribute('aria-pressed')).toBe('true');
        toggle.click();
        expect(toggle.getAttribute('aria-label')).toBe('expand navigation');
        expect(root.querySelector('.miniature')).toBe(scene);
        running.unsubscribe();
        expect(root.childElementCount).toBe(0);
        toggle.click();
        expect(events).toHaveLength(8);
    });
    it('patches keyed map sections without resetting history, mode or zoom', () => {
        const element = new HksNavigator();
        document.body.append(element);
        const root = element.shadowRoot ?? element;
        const updates = new EventTarget();
        const changed: MiniMap = {
            ...example,
            sections: [
                {
                    id: 'make',
                    name: 'Creative work',
                    rect: { x: 30, y: 20, width: 150, height: 120 },
                },
            ],
            view: { x: 20, y: 18, width: 190, height: 150 },
        };
        const running = element
            .connect$(
                merge(of(example), fromEvent(updates, 'update').pipe(map(() => changed))),
                of('125%'),
                of(true),
                of({ undo: true, redo: false }),
                of(true),
            )
            .subscribe();
        const target = root.querySelector('[data-jump="make"]');
        updates.dispatchEvent(new Event('update'));
        expect(root.querySelector('[data-jump="make"]')).toBe(target);
        expect(target?.textContent).toContain('Creative work');
        expect(root.querySelector('.viewport')?.getAttribute('x')).toBe('20');
        expect(requireChild(root, '.readout').textContent).toBe('125%');
        expect(requireElement(root, '[data-edit="undo"]', HTMLButtonElement).disabled).toBe(false);
        expect(requireChild(root, '.state-mode').getAttribute('aria-pressed')).toBe('true');
        running.unsubscribe();
    });
});

it('keeps its launcher mounted while expanding, and tracks slot changes', () => {
    const element = new HksNavigator();
    const launcher = document.createElement('div');
    launcher.slot = 'launcher';
    launcher.textContent = 'Make Plan System';
    element.append(launcher);
    document.body.append(element);
    const root = element.shadowRoot ?? element;
    const open$ = element.toggles$.pipe(
        scan(open => !open, false),
        startWith(false),
    );
    const running = element
        .connect$(of(example), of('100%'), open$, of({ undo: false, redo: false }), of(false))
        .subscribe();
    expect(element.hasAttribute('data-launcher')).toBe(true);
    requireElement(root, '.toggle', HTMLButtonElement).click();
    expect(element.querySelector('[slot="launcher"]')).toBe(launcher);
    expect(element.hasAttribute('data-open')).toBe(true);
    launcher.remove();
    requireChild(root, 'slot[name="launcher"]').dispatchEvent(new Event('slotchange'));
    expect(element.hasAttribute('data-launcher')).toBe(false);
    running.unsubscribe();
    expect(root.childElementCount).toBe(0);
});
