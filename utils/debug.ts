import _debug, { Debugger } from 'debug'

const _debugPrefix = 'parsers'
const _debuggers: Record<string, Debugger> = {}
_debug.enable([...(process.env.DEBUG?.split(',') || []), _debugPrefix + ':*'].join(','))
export const getDebugger = function (name: string): Debugger {
    if (!(name in _debuggers)) {
        _debuggers[name] = _debug(`${_debugPrefix}:${name}`)
    }

    (_debuggers[name] as any).useColors = true

    return _debuggers[name]
}

const debuggers = [
    'system',
    'linter',
    'relations'
] as const
type DebuggerName = typeof debuggers[number]

export const DEBUG: Record<DebuggerName, Debugger> = {} as any

debuggers.forEach((it) => {
    Object.defineProperty(DEBUG, it, {
        value: getDebugger(it),
        writable: false
    })
})
