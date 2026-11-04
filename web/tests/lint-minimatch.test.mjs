import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const consumers = ['eslint', '@eslint/config-array', '@eslint/eslintrc', 'eslint-plugin-import',
  'eslint-plugin-jsx-a11y', 'eslint-plugin-react', '@typescript-eslint/typescript-estree'];

test('every ESLint minimatch consumer gets the patched, callable adapter', () => {
  for (const name of consumers) {
    const fromConsumer = createRequire(require.resolve(name));
    const minimatch = fromConsumer('minimatch');
    assert.equal(fromConsumer('minimatch/package.json').version, '11.0.4+f1.compat.1', name);
    // minimatch 3 callers invoke the module or its interop default; minimatch 10+ callers use named exports.
    assert.equal(minimatch('src/app/page.tsx', '**/*.tsx'), true, name);
    assert.equal(minimatch.default('Label', 'Lab*'), true, name);
    assert.equal(minimatch.minimatch('x.js', '*.ts'), false, name);
    assert.equal(new minimatch.Minimatch('src/**', { dot: true }).match('src/.hidden/a.ts'), true, name);
    assert.equal(minimatch.makeRe('lib/*').test('lib/a'), true, name);
    assert.equal(minimatch('a/b/c.js', 'c.js', { matchBase: true }), true, name);
  }
});
