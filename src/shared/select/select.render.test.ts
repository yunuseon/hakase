import { afterEach, describe, expect, it } from 'vitest';
import { of } from 'rxjs';
import { HksSelect } from './select.component.ts';
import { HksSketchControls } from '../../components/sketch/controls/sketch-controls.component.ts';
import { requireElement } from '../../lib/dom.ts';
import { renderOptions } from './options.component.ts';

afterEach(() => document.body.replaceChildren());

describe('lit-html custom select integration', () => {
    it('constructs disconnected nested controls with explicit routing attributes', () => {
        const controls = new HksSketchControls();
        controls.presets([{ value: 'paper', label: 'Paper' }]);
        const root = controls.shadowRoot ?? controls;
        const theme = requireElement(root, '[data-pick="theme"]', HksSelect);
        expect(theme.options[0]?.textContent).toBe('Paper');
        expect(
            requireElement(root, '[data-cycles="k1"]', HksSelect).options.length,
        ).toBeGreaterThan(0);
        // The process must dispose even a component that was never attached.
        const running = controls.connect$(of(), of(), of(), of(), of()).subscribe();
        running.unsubscribe();
        expect(root.querySelector('.panes')).toBe(null);
    });

    it('updates option labels without replacing their nodes', () => {
        const control = new HksSelect();
        document.body.append(control);
        const view = renderOptions(control);
        const lifetime = view.lifetime$.subscribe();
        view.update([{ value: 'a', label: 'Before' }]);
        const option = control.options[0];
        view.update([{ value: 'a', label: 'After' }]);
        expect(control.options[0]).toBe(option);
        expect(control.options[0]?.textContent).toBe('After');
        lifetime.unsubscribe();
    });
});
