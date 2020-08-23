import { getAllModules, Module, sourceDir } from './core'
import { DEBUG } from '../utils/debug'
import { readFileSync } from 'fs'
import { join } from 'path'

/*
 * Simple linter that prevents obvious errors like
 * missing dependency for `ctx.deps`
 *
 * Simple to bypass by design, thus regex-based.
 */
export function lintModule (module: Module): boolean {
    let ok = true

    if (!module.source) {
        module.source = readFileSync(join(sourceDir, module.uid + '.ts'))
    }

    let sourceCode = module.source.toString()
    let availableDependencies = module.provide

    let usedDependencies: Set<string> = new Set()
    sourceCode.replace(/ctx\.deps\[['"](.+?)['"]\]/g, (_, $1) => {
        usedDependencies.add($1)
        return _
    })

    for (let dep of usedDependencies) {
        if (!availableDependencies?.includes(dep)) {
            DEBUG.linter('%s: Usage of undeclared dependency %s', module.uid, dep)
            ok = false
        }
    }

    return ok
}

if (require.main === module) {
    DEBUG.linter('Linting all modules...')
    for (let mod of getAllModules()) {
        lintModule(mod)
    }
}