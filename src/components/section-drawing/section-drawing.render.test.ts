import { afterEach, describe, expect, it } from 'vitest';
import { merge } from 'rxjs';
import { scan, share, startWith } from 'rxjs/operators';
import { HksSectionDrawing } from './section-drawing.component.ts';
import { reduceDrawing, type DrawingAction } from './section-drawing.ts';

afterEach(() => document.body.replaceChildren());

const pointer = (type: string, x: number, y: number) =>
    new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        clientX: x,
        clientY: y,
        bubbles: true,
        composed: true,
        cancelable: true,
    });

describe('section drawing interaction lifetime', () => {
    it('previews a touch drag, cancels on pointercancel and disposes document listeners', () => {
        const element = new HksSectionDrawing();
        document.body.append(element);
        const events: DrawingAction[] = [];
        const changes$ = element.changes$.pipe(share());
        const initial = { mode: 'ready', tool: 'paint' } as const;
        const state$ = changes$.pipe(scan(reduceDrawing, initial), startWith(initial));
        const connection = merge(element.connect$(state$), changes$).subscribe(event => {
            if (event !== undefined) events.push(event);
        });
        element.dispatchEvent(pointer('pointerdown', 90, 100));
        document.dispatchEvent(pointer('pointermove', 30, 40));
        const outline = element.shadowRoot?.querySelector('.outline');
        expect(outline instanceof HTMLElement ? outline.style.width : null).toBe('60px');
        document.dispatchEvent(pointer('pointercancel', 30, 40));
        expect(element.hidden).toBe(true);
        expect(events.at(-1)).toEqual({ kind: 'cancel' });
        connection.unsubscribe();
        const count = events.length;
        document.dispatchEvent(pointer('pointermove', 200, 200));
        document.dispatchEvent(pointer('pointerup', 200, 200));
        expect(events).toHaveLength(count);
        expect(element.shadowRoot?.querySelector('.outline')).toBe(null);
    });
});
