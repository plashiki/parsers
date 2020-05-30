import { ParserContext } from '../../types/ctx'
import { Translation } from '../../types'

export const provide = ['common/lookup']

export async function * entry (ctx: ParserContext): AsyncIterable<Translation> {
    let lastSaved = await ctx.libs.kv.get('a365-ls', 0)
    const notIgnored = {
        tv: 1,
        ova: 1,
        ona: 1,
        movie: 1,
        special: 1,
    }
    const kinds = { 'raw': 'raw', 'sub': 'sub', 'voice': 'dub' }
    const langs = { 'ru': 'ru', 'en': 'en', 'ja': 'jp' }


    while (true) {
        const json = await ctx.libs.fetch(`http://smotret-anime.ru/api/translations/?feed=id&limit=1000&afterId=${lastSaved}`, {
            headers: {
                'User-Agent': 'PlaShiki/2.0.0'
            }
        }).then(i => i.json())

        if (json.error) {
            ctx.log('error: %o', json.error)
            break
        }

        if (!json.data.length) break

        ctx.debug('loaded %d items', json.data.length)

        for (let tr of json.data) {
            if (!notIgnored[tr.episode.episodeType]) continue
            if (!(tr.typeKind in kinds)) continue

            yield {
                target_id: tr.series.myAnimeListId,
                target_type: 'anime',
                part: Math.floor(parseFloat(tr.episode.episodeInt)),
                kind: kinds[tr.typeKind],
                lang: langs[tr.typeLang] || 'other',
                hq: tr.qualityType === 'bd',
                author: tr.authorsSummary.trim(),
                url: tr.embedUrl
            }

            lastSaved = tr.id
            await ctx.libs.kv.set('a365-ls', lastSaved)
        }
    }
}
