import { CleanerContext } from '../../types/ctx'

export async function * entry (ctx: CleanerContext): AsyncIterable<number> {
    const s = await ctx.params.Translation.query('select id from translations where url like \'%plashiki.online/player%\'')

    for (let i of s) {
        yield i.id
    }
}
