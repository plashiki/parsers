import { cacheFile, createRevisionHash, createSourceHash, getAllModules, getSource, sourceDir } from './core'
import { DEBUG } from '../utils/debug'
import { createIndex } from '../utils/object-utils'
import { compileModule } from './compiler'
import fetch from 'node-fetch'
import { dirname, join } from 'path'
import * as fs from 'fs'
import { writeFileSync } from 'fs'
import { createHash } from 'crypto'

async function pull (force = false) {
    if (force) {
        DEBUG.system('WARN! --force enabled, all unpushed changes will be overwritten')
    }
    const conflicts: Record<string, true> = {}

    const modules = getAllModules()
    const modulesIndex = createIndex(modules, 'uid')

    let cache = {}
    try {
        cache = require(cacheFile)

        for (let mod of Object.keys(cache)) {
            if (!modulesIndex[mod]) {
                DEBUG.system('%s: possible conflict (deleted)', mod)
                conflicts[mod] = true
            }
        }
    } catch (e) {
        DEBUG.system('No cache.json found, creating.')
    }

    for (let mod of modules) {
        const cached = cache[mod.uid]
        mod.source = getSource(mod)
        const sourceHash = createSourceHash(mod)
        if (!cached || cached.hash !== sourceHash) {
            mod.compiled = compileModule(mod)
            const revision = createRevisionHash(mod)
            if (!cached || cached.rev !== revision) {
                conflicts[mod.uid] = true
                DEBUG.system('%s: possible conflict (%s)', mod.uid, cached ? 'updated' : 'created')
            }
        }
    }

    const data = await fetch(process.env.PULL_ENDPOINT!, {
        method: 'POST',
        headers: {
            Authorization: 'Token ' + process.env.APP_SECRET,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            hashes: Object.values(cache).map(i => (i as any).rev)
        })
    }).then(i => i.json())

    if (!data.ok) {
        DEBUG.system('pull failed: %s', data.reason)
        return
    }

    const write = data.result.filter(i => !conflicts[i.uid])
    DEBUG.system('Received %d parsers, %d will be written', data.result.length, write.length)
    for (let mod of write) {
        const filename = join(sourceDir, mod.uid + '.ts')
        const dir = dirname(filename)
        await fs.promises.mkdir(dir, {
            recursive: true
        })
        await fs.promises.writeFile(filename, mod.source)

        const hash = createHash('md5').update(mod.source).digest().toString('hex')
        cache[mod.uid] = {
            hash,
            rev: mod.hash
        }
    }

    writeFileSync(cacheFile, JSON.stringify(cache, null, 4))
}

if (require.main === module) {
    pull(process.argv.includes('--force')).catch(console.error)
}
