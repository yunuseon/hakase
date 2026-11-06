import process from 'node:process';
import { defineConfig } from 'vitest/config';

const flag = (name: string, fallback: boolean): boolean => {
    const value = process.env[name];
    return value === undefined ? fallback : value === 'true';
};

export default defineConfig({
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'logic',
                    environment: 'node',
                    include: ['src/**/*.test.ts'],
                    exclude: ['src/**/*.render.test.ts'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'ui',
                    environment: 'happy-dom',
                    include: ['src/**/*.render.test.ts'],
                },
            },
        ],
    },
    server: {
        // Listen on all interfaces so the server is reachable from outside a container.
        host: true,
        // Opening a browser makes sense on a laptop, not inside one.
        open: flag('VITE_OPEN', true),
        watch: {
            // Bind mounts do not forward filesystem events reliably; polling does.
            usePolling: flag('VITE_POLL', false),
        },
    },
    build: {
        target: 'es2022',
        sourcemap: true,
    },
});
