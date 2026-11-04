// ESLint 9 and its plugins require minimatch 3 or 10, both affected by
// GHSA-g3hv-75wg-m249. This adapter serves those callers from patched
// minimatch 11 while keeping the old CommonJS shape: the module itself is the
// match function, with `default`, `minimatch`, `Minimatch` and `makeRe` attached.
// Lint tooling only; remove the override once ESLint's chain ships minimatch >= 11.0.1.
const upstream = require('minimatch-upstream');

const minimatch = (path, pattern, options) => upstream.minimatch(path, pattern, options);
// Helpers hang off the function in minimatch 11, not the module.
Object.assign(minimatch, upstream.minimatch, upstream);
// minimatch 11 removed makeRe; its only caller (eslint-plugin-import's
// no-internal-modules) just calls .test() on the result.
minimatch.makeRe = (pattern, options) => {
  const matcher = new upstream.Minimatch(pattern, options);
  return { test: path => matcher.match(path) };
};
minimatch.minimatch = minimatch;
minimatch.default = minimatch;

module.exports = minimatch;
