import { ParserContext } from '../../types/ctx'
import { ParserAdapter } from '../../types'

export function entry (ctx: ParserContext): Function {
    return function compose<T, R> (adapters: ParserAdapter<T, R>[]): ParserAdapter<T, R> {
        return async function (item: T): Promise<R[]> {
            for (let adapter of adapters) {
                const result = await adapter(item)
                if (result.length) {
                    return result
                }
            }

            ctx.debug('compose fell through for %o', item)
            return []
        }
    }
}
