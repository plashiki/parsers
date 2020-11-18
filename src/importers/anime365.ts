import { ParserContext } from '../../types/ctx'
import { ExternalService, ExternalServiceMappings, Translation } from '../../types'

export const provide = ['common/lookup', 'common/parse-author']
export const storage = ['a365-ls']

export async function * entry (ctx: ParserContext): AsyncIterable<Translation> {
    const { kv, fetch, mappings } = ctx.libs

    let lastSaved = await kv.get('a365-ls', 0)
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
        const json = await fetch(`http://smotret-anime.ru/api/translations/?feed=id&limit=1000&afterId=${lastSaved}`, {
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

            let mapping: ExternalServiceMappings = {}
            if (tr.series.myAnimeListId > 0) {
                mapping.mal = tr.series.myAnimeListId
            }
            if (tr.series.aniDbId > 0) {
                mapping.anidb = tr.series.aniDbId
            }
            if (tr.series.animeNewsNetworkId > 0) {
                mapping.ann = tr.series.animeNewsNetworkId
            }
            if (tr.series.fansubsId > 0) {
                mapping.fansubs = tr.series.fansubsId
            }
            if (tr.series.imdbId > 0) {
                mapping.imdb = tr.series.imdbId
            }
            if (tr.series.worldArtId > 0) {
                mapping.worldart = tr.series.worldArtId
            }
            mapping.anime365 = tr.series.id

            try {
                await mappings.extend('anime', mapping)
            } catch (e) {
                ctx.log('conflict mapping: %o', mapping)
            }


            let ret: Translation = {
                target_id: mapping.mal as any,
                target_type: 'anime',
                part: Math.floor(parseFloat(tr.episode.episodeInt)),
                kind: kinds[tr.typeKind],
                lang: langs[tr.typeLang] || 'other',
                author: ctx.deps['common/parse-author'](tr.authorsSummary.trim()),
                url: tr.embedUrl
            }

            if (!ret.target_id) {
                let [service, id] = Object.entries(mapping)[0]
                ret.target_id = {
                    service: service as ExternalService,
                    id: id!
                }
            }

            yield ret

            lastSaved = tr.id
            await kv.set('a365-ls', lastSaved)
        }
    }
}
