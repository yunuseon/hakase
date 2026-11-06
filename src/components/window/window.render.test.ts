import { afterEach, describe, expect, it, vi } from 'vitest';
import { HksWindow } from './window.component.ts';

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
});

describe('window exit lifetime', () => {
    it('keeps content mounted and inert until its own exit finishes', () => {
        const element = new HksWindow();
        const content = document.createElement('div');
        element.append(content);
        document.body.append(element);
        const done = vi.fn();
        element.disappear$().subscribe({ complete: done });
        expect(element.inert).toBe(true);
        expect(content.isConnected).toBe(true);
        element.dispatchEvent(
            new AnimationEvent('animationend', { animationName: 'program-appear' }),
        );
        expect(done).not.toHaveBeenCalled();
        element.dispatchEvent(
            new AnimationEvent('animationend', { animationName: 'program-disappear' }),
        );
        expect(done).toHaveBeenCalledOnce();
        expect(element.inert).toBe(false);
        expect(element.hasAttribute('data-closing')).toBe(false);
    });

    it('finishes even when a hidden surface never dispatches animationend', () => {
        vi.useFakeTimers();
        const element = new HksWindow();
        const done = vi.fn();
        element.disappear$().subscribe({ complete: done });
        vi.advanceTimersByTime(200);
        expect(done).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('cancels its fallback timer and restores interaction on teardown', () => {
        vi.useFakeTimers();
        const element = new HksWindow();
        const running = element.disappear$().subscribe();
        running.unsubscribe();
        expect(element.inert).toBe(false);
        expect(element.hasAttribute('data-closing')).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('closes immediately for reduced motion', () => {
        vi.spyOn(window, 'matchMedia').mockReturnValue({
            ...window.matchMedia('(prefers-reduced-motion: reduce)'),
            matches: true,
        });
        const element = new HksWindow();
        const done = vi.fn();
        element.disappear$().subscribe({ complete: done });
        expect(done).toHaveBeenCalledOnce();
        expect(element.hasAttribute('data-closing')).toBe(false);
    });
});
