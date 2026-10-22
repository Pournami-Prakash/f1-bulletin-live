import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { getRootDirs } = require('@next/eslint-plugin-next/dist/utils/get-root-dirs');

test('Next lint root discovery retains directory, brace, and multi-root glob behavior', () => {
  const root = mkdtempSync(join(tmpdir(), 'f1-lint-roots-'));
  try {
    for (const name of ['one', 'two', 'three']) mkdirSync(join(root, name));
    writeFileSync(join(root, 'not-a-directory'), '');
    const discover = (rootDir) => getRootDirs({ cwd: root, settings: { next: { rootDir } } }).sort();
    assert.deepEqual(discover(undefined), [root]);
    assert.deepEqual(discover(join(root, '*')), ['one', 'three', 'two'].map(name => join(root, name)).sort());
    assert.deepEqual(discover(join(root, '{one,two}')), ['one', 'two'].map(name => join(root, name)));
    assert.deepEqual(discover([join(root, 'one'), join(root, 'three')]), ['one', 'three'].map(name => join(root, name)));
    assert.deepEqual(discover(join(root, 'missing-*')), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
