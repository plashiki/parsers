import { ParserContext } from '../../types/ctx'


export interface FetchOneResult<T> {
    /**
     * If false then we know current item is last
     */
    next?: boolean

    item: T | T[] | null
}

export interface IncrementalGrabOptions<T> {
    /**
     * Max number of empty (deleted) elements.
     * Default is 15
     */
    maxEmpty?: number
    /**
     * Default lastSaved item (if none in storage)
     */
    lastSaved?: number
    /**
     * Grab ID. Defaults to root parser's UID
     */
    id?: string

    fetcher (id: number): Promise<FetchOneResult<T>>
}

export function entry (ctx: ParserContext): Function {
    const { kv } = ctx.libs

    return async function * incrementalGrab<T> (options: IncrementalGrabOptions<T>): AsyncIterable<T> {
        const storage = `inc-ls:${options.id ?? ctx.rootUid}`
        const lastSaved = await kv.get(storage, options.lastSaved ?? 0)
        let current = lastSaved + 1
        let failed = 0
        const maxFailed = options.maxEmpty ?? 15
        ctx.debug('lastSaved = %d', lastSaved)

        while (true) {
            const result = await options.fetcher(current)
            if (result.item !== null) {
                if (Array.isArray(result.item)) {
                    yield * result.item
                } else {
                    yield result.item
                }
                await kv.set(storage, current)
            } else {
                ctx.debug('nothing at %d, ignoring: %s, can fail %d more times', current, result.next === true, maxFailed - failed - 1)
                if (result.next !== true) {
                    failed++
                }
            }

            current++

            if (failed >= maxFailed) {
                ctx.debug('%d failed, exiting', failed)
                break
            }
        }
    }
}
