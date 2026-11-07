import { afterEach, expect, it } from 'vitest';
import { of } from 'rxjs';
import { HksCanvas } from './canvas.component.ts';
import { IDENTITY } from '../../shared/camera.ts';
import type { PointerPhase } from '../../shared/drag.ts';
afterEach(() => document.body.replaceChildren());
it('updates selection cursor readiness on Shift transitions and clears it on blur', () => {
    const canvas = new HksCanvas();
    document.body.append(canvas);
    const ground = canvas.shadowRoot?.querySelector('.ground');
    const running = canvas.connect$(of(IDENTITY), of(new Map()), of(false)).subscribe();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }));
    expect(ground?.hasAttribute('data-select-ready')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
    expect(ground?.hasAttribute('data-select-ready')).toBe(false);
    ground?.dispatchEvent(
        new PointerEvent('pointerenter', { pointerType: 'mouse', shiftKey: true }),
    );
    expect(ground?.hasAttribute('data-select-ready')).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(ground?.hasAttribute('data-select-ready')).toBe(false);
    running.unsubscribe();
});

it('starts selection on Shift-press and follows the same drag without panning, with teardown', () => {
    const canvas = new HksCanvas();
    document.body.append(canvas);
    const ground = canvas.shadowRoot?.querySelector('.ground');
    expect(ground).toBeInstanceOf(HTMLElement);
    if (!(ground instanceof HTMLElement)) return;
    const selections: PointerPhase[] = [];
    const gestures: unknown[] = [];
    const running = canvas.selects$.subscribe(value => selections.push(value));
    running.add(canvas.gestures$.subscribe(value => gestures.push(value)));
    const pointer = {
        pointerId: 1,
        isPrimary: true,
        pointerType: 'mouse',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
    };
    ground.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientX: 10 }));
    expect(selections.map(p => p.phase)).toEqual(['grab']);
    document.dispatchEvent(
        new PointerEvent('pointermove', { ...pointer, shiftKey: false, clientX: 40 }),
    );
    document.dispatchEvent(
        new PointerEvent('pointerup', { ...pointer, shiftKey: false, clientX: 50 }),
    );
    expect(selections.map(p => [p.phase, p.event.clientX])).toEqual([
        ['grab', 10],
        ['move', 40],
        ['release', 50],
    ]);
    expect(gestures).toEqual([]);
    ground.click();
    const input = document.createElement('input');
    canvas.append(input);
    input.dispatchEvent(new PointerEvent('pointerdown', pointer));
    ground.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, shiftKey: false }));
    ground.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, button: 2 }));
    expect(selections).toHaveLength(3);
    ground.dispatchEvent(new PointerEvent('pointerdown', pointer));
    document.dispatchEvent(new PointerEvent('pointercancel', pointer));
    expect(selections.at(-1)?.event.type).toBe('pointercancel');
    running.unsubscribe();
    ground.dispatchEvent(new PointerEvent('pointerdown', pointer));
    document.dispatchEvent(new PointerEvent('pointermove', pointer));
    expect(selections).toHaveLength(5);
});

it('routes copy and paste shortcuts outside editable controls and releases its listeners', () => {
    const canvas = new HksCanvas();
    document.body.append(canvas);
    const commands: string[] = [];
    const running = canvas.clipboard$.subscribe(command => commands.push(command));
    const copy = new KeyboardEvent('keydown', {
        key: 'c',
        metaKey: true,
        bubbles: true,
        cancelable: true,
    });
    document.dispatchEvent(copy);
    expect(copy.defaultPrevented).toBe(true);
    document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    const input = document.createElement('input');
    canvas.append(input);
    const native = new KeyboardEvent('keydown', {
        key: 'v',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
    });
    input.dispatchEvent(native);
    expect(native.defaultPrevented).toBe(false);
    expect(commands).toEqual(['copy', 'paste']);
    running.unsubscribe();
    document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true, cancelable: true }),
    );
    expect(commands).toHaveLength(2);
});
