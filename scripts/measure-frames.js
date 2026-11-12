/* global window, document, performance, console, innerWidth, innerHeight, devicePixelRatio */
// Paste into the browser console on the running app. It measures frames paused, then with every clock playing, and pauses them again.
(async () => {
    const all = root =>
        [...root.querySelectorAll('*')].flatMap(e => [
            e,
            ...(e.shadowRoot ? all(e.shadowRoot) : []),
        ]);
    const transports = () => all(document).filter(e => e.tagName === 'HKS-TRANSPORT');
    const press = label =>
        transports().forEach(t =>
            t.shadowRoot.querySelector(`button[aria-label="${label}"]`)?.click(),
        );
    const scripts = new Map();
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback =>
        raf(stamp => {
            const start = performance.now();
            try {
                callback(stamp);
            } finally {
                scripts.set(stamp, (scripts.get(stamp) ?? 0) + performance.now() - start);
            }
        });
    const measure = async ms => {
        scripts.clear();
        const gaps = [];
        let last = performance.now();
        const end = last + ms;
        await new Promise(done => {
            const tick = now => {
                gaps.push(now - last);
                last = now;
                if (now < end) {
                    raf(tick);
                } else {
                    done();
                }
            };
            raf(tick);
        });
        const sorted = list => [...list].sort((a, b) => a - b);
        const at = (list, p) =>
            list[Math.min(list.length - 1, Math.floor(p * list.length))]?.toFixed(1);
        const g = sorted(gaps);
        const s = sorted(scripts.values());
        return {
            fps: Math.round(gaps.length / (ms / 1000)),
            'frame median ms': at(g, 0.5),
            'frame p95 ms': at(g, 0.95),
            'frames over 25 ms': gaps.filter(gap => gap > 25).length,
            'script median ms': at(s, 0.5),
            'script p95 ms': at(s, 0.95),
        };
    };
    const windows = all(document).filter(e => e.tagName === 'HKS-WINDOW');
    const inView = windows.filter(w => {
        const r = w.getBoundingClientRect();
        return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
    }).length;
    press('pause');
    const paused = await measure(3000);
    press('play');
    await measure(1000);
    const playing = await measure(5000);
    press('pause');
    window.requestAnimationFrame = raf;
    console.table({ paused, playing });
    console.log(
        `${windows.length} windows, ${inView} in view, ${innerWidth}x${innerHeight} at ${devicePixelRatio}x`,
    );
})();
