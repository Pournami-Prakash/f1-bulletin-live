# Next.js lint directory discovery

This private workspace replaces the `fast-glob` package required by
`@next/eslint-plugin-next@16.4.2`. It implements the plugin's sole use of that
package: `globSync(pattern, { onlyDirectories: true })` in `get-root-dirs`.
The existing Next, React, hooks, and TypeScript lint rules remain enabled.

The implementation uses `tinyglobby@0.2.17`, which does not depend on the
unpatched `braces` chain. The adapter preserves absolute/relative output and
directory formatting; direct package aliasing does not preserve those details.
Other fast-glob APIs are intentionally not implemented. This is project-owned
code, not a patched upstream fast-glob release, and must never be published.

The package version satisfies Next's exact dependency so npm workspaces link it
reproducibly during `npm ci`. `tests/lint-root-dirs.test.mjs` exercises Next's
actual directory discovery with absolute, brace, and multiple directory globs.
Review this adapter if Next adds other fast-glob usage, and remove the workspace
replacement when the upstream dependency chain has a published fix.
