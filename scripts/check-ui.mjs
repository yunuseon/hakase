import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const filesUnder = async directory => {
    const entries = await readdir(directory, { withFileTypes: true });
    return (
        await Promise.all(
            entries.map(entry =>
                entry.isDirectory()
                    ? filesUnder(join(directory, entry.name))
                    : [join(directory, entry.name)],
            ),
        )
    ).flat();
};
const root = fileURLToPath(new URL('../', import.meta.url));
const files = await filesUnder(join(root, 'src'));
const components = files.filter(path => path.endsWith('.component.ts'));
const catalogue = (
    await Promise.all(
        files
            .filter(
                path =>
                    (path.includes('/storybook/') && path.endsWith('-stories.ts')) ||
                    path.endsWith('/storybook/stories.ts'),
            )
            .map(path => readFile(path, 'utf8')),
    )
).join('\n');
const tags = new Set([...catalogue.matchAll(/['"](hks-[a-z-]+)['"]/g)].map(match => match[1]));
const findings = (
    await Promise.all(
        components.map(async path => {
            const source = await readFile(path, 'utf8');
            const name = relative(root, path);
            const issues = [];
            const interactive = /<(?:button|input|textarea|summary|hks-select)\b/.test(source);
            if (interactive && !source.includes('controlsSheet')) {
                issues.push(`${name}: adopt the shared controlsSheet.`);
            }
            if (/<(?:select|datalist)\b/.test(source)) {
                issues.push(`${name}: use hks-select instead of a native select/datalist.`);
            }
            if (/<button\b[^>]*role="radio"/.test(source) && !source.includes('connectChoices$')) {
                issues.push(`${name}: connect button-based radio groups with connectChoices$.`);
            }
            for (const match of source.matchAll(/<\w+\b[^>]*role="radiogroup"[^>]*>/g)) {
                if (!/class="[^"]*\bui-choices\b/.test(match[0])) {
                    issues.push(`${name}: give the radiogroup the ui-choices container.`);
                }
            }
            for (const match of source.matchAll(/<(input|hks-select)\b[^>]*>/g)) {
                const tag = match[0];
                const primitive =
                    match[1] === 'hks-select'
                        ? 'ui-field'
                        : /type="range"/.test(tag)
                          ? 'ui-range'
                          : /type="checkbox"/.test(tag)
                            ? 'ui-check'
                            : /type="color"/.test(tag)
                              ? 'ui-colour'
                              : null;
                if (
                    primitive !== null &&
                    !new RegExp(`class="[^"\n]*\\b${primitive}\\b`).test(tag)
                ) {
                    issues.push(`${name}: use ${primitive} on the native control.`);
                }
            }
            for (const match of source.matchAll(/customElements\.define\(['"](hks-[a-z-]+)['"]/g)) {
                // The catalogue host is intentionally not recursive.
                if (match[1] !== 'hks-storybook' && !tags.has(match[1])) {
                    issues.push(`${name}: ${match[1]} has no catalogue entry.`);
                }
            }
            return issues;
        }),
    )
).flat();
const sheets = files.filter(path => path.endsWith('.css') && !path.endsWith('/src/styles.css'));
const finishing = (
    await Promise.all(
        sheets.map(async path => {
            const source = await readFile(path, 'utf8');
            const name = relative(root, path);
            return [...source.matchAll(/([a-z-]+)\s*:\s*([^;{}]*);/g)].flatMap(
                ([, property, value]) =>
                    property === 'box-shadow' &&
                    value.includes('var(--shadow)') &&
                    !/^\s*inset/.test(value)
                        ? [`${name}: use an --elevation-* token, not a hand-written shadow.`]
                        : /^(transition|animation)(-duration)?$/.test(property) &&
                            [...value.matchAll(/(\d*\.?\d+)m?s\b/g)].some(
                                ([, time]) => Number(time) > 0,
                            )
                          ? [`${name}: time ${property} with the --duration-* tokens.`]
                          : property === 'outline' && /var\(--(highlight|rule)\)/.test(value)
                            ? [`${name}: draw focus with var(--focus-ring).`]
                            : [],
            );
        }),
    )
).flat();
findings.push(...finishing);
// The size classes are four conditions, written as layout/size-class.ts gives them; any other number is a breakpoint of its own.
const SIZE_CONDITIONS = [
    '(width < 13rem)',
    '(height < 9rem)',
    '(width < 22rem)',
    '(width >= 40rem)',
];
const sizing = (
    await Promise.all(
        files
            .filter(path => path.endsWith('.css'))
            .map(async path => {
                const source = await readFile(path, 'utf8');
                return [...source.matchAll(/@container\s+window\s+([^{]+)\{/g)].flatMap(
                    ([, query]) => {
                        const rest = SIZE_CONDITIONS.reduce(
                            (left, condition) => left.replaceAll(condition, ''),
                            query,
                        ).replace(/\b(and|or)\b/g, '');
                        return rest.trim() === ''
                            ? []
                            : [
                                  `${relative(root, path)}: query the window with the size classes only (${SIZE_CONDITIONS.join(', ')}), not "${query.trim()}".`,
                              ];
                    },
                );
            }),
    )
).flat();
findings.push(...sizing);
findings.push(
    ...(
        await Promise.all(
            components.map(async path => {
                const source = await readFile(path, 'utf8');
                return source.includes('data-detail') && !source.includes('controlsSheet')
                    ? [
                          `${relative(root, path)}: adopt controlsSheet, which holds the glance rule data-detail relies on.`,
                      ]
                    : [];
            }),
        )
    ).flat(),
);
if (findings.length > 0) {
    process.stderr.write(`${findings.join('\n')}\n`);
    process.exitCode = 1;
} else {
    process.stdout.write(
        `UI audit passed: ${components.length} component modules, shared controls and catalogue coverage checked.\n`,
    );
}
