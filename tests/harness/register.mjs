// Installs loader.mjs. Wired in as `node --import ./tests/harness/register.mjs`
// (see package.json "test"). node:module — no dependency is added by the test
// harness, deliberately: the build's dependency tree is part of what ships.
import { register } from 'node:module'
register('./loader.mjs', import.meta.url)
