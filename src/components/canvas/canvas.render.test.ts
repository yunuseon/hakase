import { afterEach, expect, it } from 'vitest';
import { HksCanvas } from './canvas.component.ts';
afterEach(() => document.body.replaceChildren());
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
