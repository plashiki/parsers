import { ParserContext } from '../../types/ctx'
import { Translation } from '../../types'

interface SrTranslation {
    // this api is so bad.

    // field using which they sort output
    episode_id: number

    // id of related anime
    episode_anime: number
    // episode number
    episode_count: number
    // 0 = subs, not 0 = dub
    episode_type: number

    episode_updated_at: string
    episode_view: number

    embed: string
}

interface SrAnime {
    // they couldn't make a `left join` so we have to request each anime individually

    anime_id: number
    // shikimori id
    anime_shikimori: number

    // trash
    anime_description: string
    anime_episodes: number
    anime_folder: string
    anime_keywords: string
    anime_name: string
    anime_name_russian: string
    anime_ongoing: number
    anime_soft_raw_link: string
    anime_studio: number
    anime_year: number
    episode_current_dub: number
    episode_current_sub: number
}

export const storage = ['sr-ls']

export async function * entry (ctx: ParserContext): AsyncIterable<Translation> {
    const { kv, fetch, objectUtils, qs } = ctx.libs

    const lastSaved = await kv.get('sr-ls', 0)
    ctx.debug('lastSaved = %d', lastSaved)

    let mapping: Record<number, number> = {}

    async function loadAnimes (ids: number[]): Promise<void> {
        let newIds = objectUtils.uniqueBy(ids.filter(i => !(i in mapping)))
        if (!newIds.length) return

        await fetch('https://service.sovetromantica.com/v1/animes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: qs.stringify({
                anime_id_array: JSON.stringify(newIds)
            })
        }).then(i => {
            if (i.status === 503) return
            if (i.status !== 200) ctx.log('http %d', i.status)

            return i.json().then((res: SrAnime[]) => {
                res.forEach(it => {
                    mapping[it.anime_id] = it.anime_shikimori
                })
            })
        })
    }

    let backlog: SrTranslation[] = []
    let backlogIndex: Record<number, true> = {}
    let offset = 0

    while (true) {
        const json: SrTranslation[] = await fetch(`https://service.sovetromantica.com/v1/last_episodes?limit=30&offset=${offset}`).then(i => i.json())

        if (json.length === 0) break
        offset += 30

        let end = false
        for (let tr of json) {
            if (tr.episode_id <= lastSaved) {
                end = true
                break
            }
            if (!(tr.episode_id in backlogIndex)) {
                backlogIndex[tr.episode_id] = true
                backlog.push(tr)
            }
        }

        await loadAnimes(json.map(i => i.episode_anime))

        ctx.debug('loaded %d items', backlog.length)
        if (end) break
    }

    // reset index because we dont need it anymore
    backlogIndex = {}

    while (backlog.length) {
        const item = backlog.pop()
        if (!item) break
        if (!mapping[item.episode_anime]) continue

        yield {
            target_id: mapping[item.episode_anime],
            target_type: 'anime',
            part: item.episode_count,
            kind: item.episode_type === 0 ? 'sub' : 'dub',
            lang: 'ru',
            author: { group: 'SovetRomantica' },
            url: item.embed // .replace(/sovetromantica\.com/i, 'sovetromantica.moe')
        }

        await kv.set('sr-ls', item.episode_id)
    }

}
