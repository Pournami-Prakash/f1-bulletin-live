// Next 16.4.2 uses only fast-glob.globSync(pattern, { onlyDirectories: true }).
// Keep that contract while removing its unpatched braces dependency chain.
const { globSync: discover } = require('tinyglobby');
const { isAbsolute, parse } = require('node:path');

exports.globSync = (pattern, options) => {
  if (typeof pattern !== 'string' || options?.onlyDirectories !== true) {
    throw new TypeError('This adapter supports Next lint directory discovery only');
  }
  return discover(pattern, {
    onlyDirectories: true,
    expandDirectories: false,
    absolute: isAbsolute(pattern),
  }).map(directory => directory.replace(/[\\/]+$/, '') || parse(directory).root);
};
