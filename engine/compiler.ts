import { Module } from './core'
import { StringKV } from '../types'
import { DEBUG } from '../utils/debug'
import sass from 'sass'
import * as babel from '@babel/core'
import * as UglifyJS from 'uglify-js'

const FALLBACK_CODE = 'throw new Error("COMPILATION FAILED")'

export function compileRootAssets (mod: Module): StringKV {
    if (!mod.compile) return {}
    let ret = {}
    for (let [k, v] of Object.entries(mod.compile)) {
        // detect asset type
        if (k.startsWith('js_')) {
            let code = babel.transformSync(v, {
                filename: 'asset.js',
                presets: [
                    '@babel/preset-env'
                ]
            })?.code
            if (code) {
                code = UglifyJS.minify(code).code
            }

            ret['COMPILED_' + k.toUpperCase()] = code ?? FALLBACK_CODE
            if (code === null) {
                DEBUG.system('Compilation failed for %s (@ %s)', k, mod.uid)
            }

        } else if (k.startsWith('css_')) {
            ret['COMPILED_' + k.toUpperCase()] = sass.renderSync({
                data: v,
                outputStyle: 'compressed'
            }).css.toString()
        } else {
            DEBUG.system('While compiling %s: unknown resource type for %s', mod.uid, k)
        }
    }

    return ret
}


export function compileModule (mod: Module): string {
    const entry = mod.entry
    if (!entry) {
        DEBUG.system('No entry point found at %s', mod.uid)
        return FALLBACK_CODE
    }

    let code: string | null | undefined = entry.toString()

    const assets = compileRootAssets(mod)
    code = code
        // remove ctx.debug calls
        .replace(/^\s*ctx\.debug\(.*\);?\s*$/gm, '')
        // replace process.env
        .replace(/process\.env\.([A-Z0-9_]+)/g, (_, $1) => {
            if ($1 === 'PRODUCTION') return 'true'

            if ($1 in process.env) {
                return JSON.stringify(process.env[$1])
            }
            if ($1 in assets) {
                return JSON.stringify(assets[$1])
            }

            DEBUG.system('Unknown reference to %s (@ %s)', $1, mod.uid)

            return '""'
        })

    code = babel.transformSync(code, {
        filename: `dist/src/${mod.uid}.js`,
        presets: [
            ['@babel/preset-env', {
                targets: {
                    'node': '12'
                }
            }],
            ['babel-preset-minify', {
                builtIns: false
            }]
        ]
    })?.code

    if (!code) {
        DEBUG.system('Compilation failed for %s', mod.uid)
        return FALLBACK_CODE
    }

    return code
        // returns entry point or no-op
        + '\n;if(typeof entry!=="undefined"){return entry}else{return function(){}}'
}
