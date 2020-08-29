import { basename, join, relative } from 'path'
import { config } from 'dotenv'
import { DEBUG } from '../utils/debug'
import { StringKV } from '../types'
import { sync as glob } from 'glob'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'

config()


export let sourceDir = join(__dirname, '..')
if (basename(sourceDir) === 'dist') {
    sourceDir = join(sourceDir, '..')
}
sourceDir = join(sourceDir, 'src')
export const cacheFile = join(sourceDir, '../cache.json')

export interface Module {
    uid: string

    compile?: StringKV
    provide?: string[]
    storage?: string[]
    disabled?: boolean
    public_?: string
    ready?: boolean
    cri?: boolean
    entry?: Function

    dependencies?: Record<string, Module>

    compiled?: string
    source?: Buffer
}

const cachedModules: Record<string, Module> = {}

export function loadModule (uid: string): Module | null {
    if (cachedModules[uid]) {
        return cachedModules[uid]
    }

    let mod: Module
    try {
        mod = require(join(__dirname, '../src/', uid)) as Module
    } catch (e) {
        return null
    }

    if (!mod.entry) {
        DEBUG.system('No entry point found at %s', uid)
    }

    mod.uid = uid

    cachedModules[uid] = mod
    return mod
}

export function loadDependencies (mod: Module, visited: Record<string, boolean> = {}): void {
    if (mod.dependencies) return
    visited[mod.uid] = true

    if (!mod.dependencies) {
        mod.dependencies = {}
    }

    mod.provide?.forEach((uid) => {
        if (!mod.dependencies![uid] && !visited[uid]) {
            let sub = loadModule(uid)
            if (!sub) {
                throw Error(`Dependency not found: ${uid}, referenced at ${mod.uid}`)
            }

            mod.dependencies![uid] = mod
            loadDependencies(mod.dependencies![uid], visited)
        }

    })

    visited[mod.uid] = false
}

export function getAllModules (): Module[] {
    const ret: Module[] = []
    for (let file of glob(join(sourceDir, '**/*.{js,ts}'))) {
        const modName = relative(sourceDir, file)
            // remove extension
            .replace(/\.[jt]s$/, '')
            // replace windows separator \ with unix /
            .replace(/\\/g, '/')
        const mod = loadModule(modName)
        if (mod && mod.ready !== false) {
            ret.push(mod)
        }
    }

    return ret
}

export function getSource (mod: Module): Buffer {
    return readFileSync(join(sourceDir, mod.uid + '.ts'))
}

export function createRevisionHash (mod: Module): string {
    return createHash('md5')
        .update(`${mod.uid}\n\n${(mod.provide ?? []).sort().join(',')}\n\n${mod.compiled}`)
        .digest()
        .toString('hex')
}

export function createSourceHash (mod: Module): string {
    return createHash('md5')
        .update(mod.source!)
        .digest()
        .toString('hex')
}
