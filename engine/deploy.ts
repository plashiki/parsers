import { cacheFile, createRevisionHash, createSourceHash, getAllModules, getSource, Module } from './core'
import { compileModule } from './compiler'
import { writeFileSync } from 'fs'
import { DEBUG } from '../utils/debug'
import { createIndex } from '../utils/object-utils'
import fetch from 'node-fetch'
import { lintModule } from './linter'

async function main () {
    const updated: Partial<Module>[] = []
    const deleted: string[] = []

    const modules = getAllModules()
    const modulesIndex = createIndex(modules, 'uid')
    DEBUG.system('%d modules found.', modules.length)

    let cache = {}
    try {
        cache = require(cacheFile)

        for (let mod of Object.keys(cache)) {
            if (!modulesIndex[mod]) {
                DEBUG.system('%s... deleted', mod)
                deleted.push(mod)
                delete cache[mod]
            }
        }
    } catch (e) {
        DEBUG.system('No cache.json found, creating.')
    }

    for (let mod of modules) {
        let str = mod.uid + '... '
        if (!lintModule(mod)) {
            DEBUG.system(str + 'lint error')
            continue
        }

        const cached = cache[mod.uid]
        mod.source = getSource(mod)
        mod.storage = mod.storage?.map(i => i.replace(/\$UID/g, mod.uid!))
        const sourceHash = createSourceHash(mod)
        if (!cached || cached.hash !== sourceHash) {
            mod.compiled = compileModule(mod)
            const revision = createRevisionHash(mod)
            cache[mod.uid] = {
                hash: sourceHash,
                rev: revision
            }
            updated.push(mod)
            DEBUG.system(str + (!cached || cached.rev !== revision ? cached ? 'updated' : 'created' : 'meta changed'))
        }
    }

    if (updated.length || deleted.length) {
        DEBUG.system('pushing: %d updated, %d deleted', updated.length, deleted.length)

        const pushResult = await fetch(process.env.DEPLOY_ENDPOINT!, {
            headers: {
                Authorization: 'Token ' + process.env.APP_SECRET,
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify({
                upsert: updated.map((mod) => ({
                    uid: mod.uid,
                    provide: mod.provide,
                    storage: mod.storage,
                    disabled: mod.disabled ?? false,
                    cri: mod.cri ?? false,
                    code: mod.compiled,
                    source: mod.source?.toString('utf-8'),
                    public: mod.public_ ?? ''
                })),
                delete: deleted
            })
        }).then(i => i.json())
        if (!pushResult.ok || pushResult.result !== 'OK') {
            DEBUG.system('push failed: returned %s', pushResult.reason || pushResult.result)
        } else {
            DEBUG.system('writing cache.json')

            writeFileSync(cacheFile, JSON.stringify(cache, null, 4))
        }
    }
}

if (require.main === module) {
    main().catch(console.error)
}
