import { loadDependencies, loadModule, Module } from './core'
import { AnyKV } from '../types'
import { libs } from '../utils/parsers-libs'
import { DEBUG, getDebugger } from '../utils/debug'
import { ParserContext } from '../types/ctx'
import { compileModule } from './compiler'
import fetch from 'node-fetch'
import { lintModule } from './linter'

export function getContextFor (mod: Module, params?: AnyKV, parent?: Module, rootCtx?: ParserContext): ParserContext {
    loadDependencies(mod)
    const ctx: ParserContext = {
        __stat: 0,
        env: 'local',
        params: params ?? {},
        libs,
        log: getDebugger(mod.uid),
        debug: getDebugger(mod.uid),
        deps: {} as any,
        rootUid: (parent ?? mod).uid,
        uid: mod.uid,

        stat (n = 1): void {
            if (rootCtx) {
                rootCtx.__stat += n
            } else {
                ctx.__stat += n
            }
        }
    }

    Object.defineProperty(ctx, 'config', {
        get () {
            throw Error('Server config is not available when running locally.')
        }
    })

    mod.provide?.forEach((uid) => {
        const sub = loadModule(uid)
        if (!sub) {
            Object.defineProperty(ctx.deps, uid, {
                get () {
                    throw new Error(`Dependency not found: ${uid}`)
                }
            })
        } else {
            Object.defineProperty(ctx.deps, uid, {
                value: sub.entry!(getContextFor(sub, params, parent ?? mod, rootCtx ?? ctx)),
                configurable: false,
                enumerable: true
            })
        }
    })

    return ctx
}

export function executeParser (uid: string, params?: AnyKV): any {
    const mod = loadModule(uid)
    if (!mod) {
        throw Error(`parser ${uid} not found`)
    }
    if (!lintModule(mod)) {
        throw Error(`Cannot proceed because of linter errors`)
    }

    const ctx = getContextFor(mod, params)

    return [ctx, mod.entry!(ctx)]
}

export async function runImporter (uid: string): Promise<void> {
    const rel = libs.relations

    let translationsCount = 0
    const [ctx, iter] = executeParser(uid)
    for await (let trans of iter) {
        if (trans.target_type === 'anime') {
            let redirection = rel.findRelation(trans.target_id, 'mal', trans.part)
            if (redirection && redirection.id.mal) {
                DEBUG.system(
                    'applied redirection: id%dp%d -> id%dp%d',
                    trans.target_id, trans.part, redirection.id.mal, redirection.n
                )
                trans.target_id = parseInt(redirection.id.mal)
                trans.part = redirection.n
            }
        }
        DEBUG.system('item: %o', trans)
        translationsCount++
    }

    let itemsCount = ctx.__stat

    DEBUG.system('==============================')
    DEBUG.system('%s efficiency: %d/%d = %f', uid, translationsCount, itemsCount,
        itemsCount === 0 ? 0 : translationsCount / itemsCount)
}

export async function runMapper (uid: string): Promise<void> {
    let [, res] = executeParser(uid)
    for await (let trans of res) {
        DEBUG.system('item: %o', trans)
    }
}

export async function runCleaner (uid: string): Promise<void> {
    DEBUG.system('Note that to test run a Cleaner, you need a running instance of PlaShiki backend')
    const mod = loadModule(uid)
    if (!mod) {
        DEBUG.system('Module %s not found', uid)
        return
    }
    const code = compileModule(mod)
    fetch(process.env.RUN_CLEANER_ENDPOINT!, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            provide: mod.provide ?? [],
            code
        })
    }).then(i => i.json()).then((res) => {
        if (!res.ok) {
            DEBUG.system('Error: %o', res)
        } else {
            DEBUG.system(res.result)
        }
    })
}
