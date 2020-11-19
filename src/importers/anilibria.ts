import { ParserContext } from '../../types/ctx'
import { MediaSeason, Translation } from '../../types'


interface AnilibriaEnvelope<T> {
    status: boolean
    data: T | null
    error?: {
        code: number
        message: string | null
        description: string | null
    }
}

interface AnilibriaFeedItem {
    release?: AnilibriaRelease
    youtube?: any // idc
}

interface AnilibriaRelease {
    id: number
    // anime names, for lookup
    names: string[]
    // unix timestamp in seconds but in string
    last: string
    // moonwalk (actually kodik) player.
    moon: string | null
    voices: string[]
    playlist: AnilibriaEpisode[]

    // зима/весна/лето/осень
    season: string
    year: string
}

interface AnilibriaEpisode {
    // episode number, starting from 1
    id: number
    title: string
    // sd m3u8
    sd: string
    // hd m3u8
    hd: string
    // fhd m3u8, optional
    fullhd?: string
    srcSd?: string
    srcHd?: string
}

export const provide = ['common/lookup']
export const storage = ['al-ls%']

export async function * entry (ctx: ParserContext): AsyncIterable<Translation> {
    const { kv, fetch, qs } = ctx.libs

    // -1 because their db sucks (very old releases have last=0)
    let lastSaved = await kv.get('al-ls', -1)
    let firstRun = lastSaved === -1

    let backlog: AnilibriaRelease[] = []
    let backlogIndex: Record<number, true> = {}
    let page = 1

    const SEASONS: Record<string, MediaSeason['season']> = {
        'зима': 'winter',
        'весна': 'spring',
        'лето': 'summer',
        'осень': 'fall',
    }

    const getSeason = (rel: AnilibriaRelease): MediaSeason | null => {
        if (!rel.season || !rel.year || !(rel.season in SEASONS) || isNaN(parseInt(rel.year))) return null
        return {
            year: parseInt(rel.year),
            season: SEASONS[rel.season]
        }
    }

    rootLoop:
        while (true) {
            let json: AnilibriaEnvelope<AnilibriaFeedItem[]> = await fetch('https://www.anilibria.tv/public/api/index.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'PlaShiki/2.0.0'
                },
                body: qs.stringify({
                    query: 'feed',
                    perPage: firstRun ? 200 : 150, // they don't have max limit tho
                    filter: 'id,last,names,moon,voices,season,playlist,year',
                    page: page++
                })
            }).then(i => i.json())

            if (json.error || !json.data) {
                ctx.log('error %d %s', json.error?.code, json.error?.message)
                return
            }
            if (!json.data.length) {
                break
            }

            for (let it of json.data) {
                if (!it.release) continue
                let rel = it.release

                if (parseInt(rel.last) <= lastSaved) break rootLoop
                if (!(rel.id in backlogIndex)) {
                    backlog.push(rel)
                    backlogIndex[rel.id] = true
                }
            }

            ctx.debug('loaded %d items', backlog.length)
        }

    backlogIndex = {}

    while (backlog.length) {
        const rel = backlog.pop()
        if (!rel) break

        let media = await ctx.deps['common/lookup']({
            names: rel.names,
            startSeason: getSeason(rel)
        })
        if (!media) continue
        let common = {
            target_id: media.id,
            target_type: 'anime' as const,
            kind: 'dub' as const,
            lang: 'ru' as const,
            author: {
                group: 'AniLibria',
                people: rel.voices
            }
        }

        let lastSavedEpisode = await kv.get(`al-ls:${rel.id}`, 0)
        let maxEpisode = 0

        for (let ep of rel.playlist) {
            if (ep.id > maxEpisode) maxEpisode = ep.id
            if (ep.id <= lastSavedEpisode) continue

            yield {
                ...common,
                part: ep.id,
                url: `https://plashiki.su/player/anilibria?rid=${rel.id}&eid=${ep.id}`
            }
        }

        if (rel.moon && lastSavedEpisode < maxEpisode) {
            for (let i = lastSavedEpisode + 1; i <= maxEpisode; i++) {
                if (rel.moon.startsWith('//')) {
                    rel.moon = 'https:' + rel.moon
                }
                yield {
                    ...common,
                    part: i,
                    url: `${rel.moon}${rel.moon.includes('?') ? '&': '?'}season=1&episode=${i}&only_episode=true`
                }
            }
        }

        ctx.stat()

        await kv.set('al-ls', parseInt(rel.last))
        await kv.set(`al-ls:${rel.id}`, maxEpisode)
    }
}
