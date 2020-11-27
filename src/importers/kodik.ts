import { ParserContext } from '../../types/ctx'
import { ExternalServiceMappings, Translation, TranslationKind } from '../../types'

interface KodikMedia {
    id: string
    // may start with '//'
    link: string
    // russian title
    title: string
    // original title (romaji)
    title_orig: string
    // other titles, divided by ' / '.
    // idk what happens when there aren't any, so handling both missing, null and empty string
    other_title?: string | null
    translation: {
        id: number
        // the only way to detect kind, lol.
        // sometimes its like this: `wakanim.Subtitles`
        // sometimes its just name of group: `MedusaSub`
        // sometimes its just kind: `Субтитры`
        // expecting a bunch of troubles with this boi
        title: string
    }
    year: number
    // numeric id in string
    kinopoisk_id: string
    // format: `tt<id>`
    imdb_id: string
    // format: `http://www.world-art.ru/animation/animation.php?id=<id>`
    worldart_link: string
    // numeric id in string
    shikimori_id: string
    // another weird stuff, though not as important as kind.
    // hd is probably when 1080p/720p or BD/HD is in string
    quality: string
    // and def not hd when camrip
    camrip: boolean
    blocked_countries: string[] | 'all'
    // both are iso timestamps
    created_at: string
    updated_at: string
}

interface KodikAnime extends KodikMedia {
    type: 'anime-serial'
    // weird flex, probably wont use
    last_season: number
    // last available episode
    last_episode: number
    // number of episodes from all (!) seasons
    episodes_count: number
    blocked_seasons: Record<string, string[] | 'all'> | 'all'
    seasons: {
        [key: number]: {
            link: string
            title?: string
            episodes: {
                // episode number -> episode link, which may start with '//'
                [key: number]: string
            }
        }
    }
}

interface KodikAnimeMovie extends KodikMedia {
    type: 'anime'
}

type KodikRelease = KodikAnime | KodikAnimeMovie

interface KodikEnvelope<T> {
    time: string
    total: number
    prev_page?: string | null
    next_page?: string | null
    results: T
}

export const provide = ['common/lookup', 'common/parse-author']
export const storage = ['kodik-ls%']

export async function * entry (ctx: ParserContext): AsyncIterable<Translation> {
    const { kv, fetch, mappings } = ctx.libs

    let lastSaved = await kv.get('kodik-ls', '1970-01-01T00:00:00.000Z')
    ctx.debug('lastSaved = %s', lastSaved)

    let url = 'https://kodikapi.com/list?token=54eb773d434f45f4c9bb462bc3ce0342&types=anime,anime-serial&limit=100&with_episodes=true'
    let backlog: KodikRelease[] = []

    rootLoop:
        while (true) {
            let json: KodikEnvelope<KodikRelease[]> = await fetch(url).then(i => i.json())

            for (let it of json.results) {
                if (it.updated_at <= lastSaved) {
                    break rootLoop
                }
                backlog.push(it)
            }

            ctx.debug('loaded %d/%d', backlog.length, json.total)

            if (json.next_page) {
                url = json.next_page
            } else {
                break
            }
        }

    while (backlog.length) {
        let it = backlog.pop()
        if (!it) break

        // determine target_id
        let target_id!: Translation["target_id"]
        if (it.shikimori_id) {
            target_id = parseInt(it.shikimori_id)
        } else if (it.worldart_link) {
            target_id = {
                service: 'worldart',
                id: it.worldart_link.split('id=')[1]
            }
        } else {
            // try lookup
            let names = [it.title]
            if (it.title_orig) {
                names.unshift(it.title_orig)
            }
            if (it.other_title) {
                names.push(...it.other_title.split(' / '))
            }

            let result = await ctx.deps['common/lookup']({
                names
            })
            if (!result) {
                // use mapping feature
                if (it.imdb_id) {
                    target_id = {
                        service: 'imdb',
                        id: it.imdb_id.substr(2)
                    }
                } else if (it.kinopoisk_id) {
                    target_id = {
                        service: 'kp',
                        id: it.kinopoisk_id
                    }
                } else {
                    // bruh moment
                    continue
                }
            } else {
                target_id = result.id
            }
        }

        // extend mappings coz why not
        let map: ExternalServiceMappings = {}
        if (it.shikimori_id) {
            map.mal = it.shikimori_id
        }
        if (it.kinopoisk_id) {
            map.kp = it.kinopoisk_id
        }
        if (it.imdb_id) {
            map.imdb = it.imdb_id.substr(2)
        }
        if (it.worldart_link) {
            map.worldart = it.worldart_link.split('id=')[1]
        }
        if (Object.keys(map).length > 1) {
            try {
                await mappings.extend('anime', map)
            } catch (e) {
                ctx.log('conflict mapping: %o', map)
            }
        }

        // determine hq, kind and author
        let kind = 'dub' as TranslationKind
        let author = it.translation.title.trim()
        if (author === 'Субтитры') {
            kind = 'sub'
            author = ''
        } else if (author.match(/\.subtitles$/i)) {
            kind = 'sub'
            author = author.replace(/\.subtitles$/i, '')
        } else if (author === 'MedusaSub') {
            kind = 'sub'
        }
        if (author.match(/AniLibria\.TV/i)) author = 'AniLibria'
        if (author.match(/anistar многоголосый/i)) author = 'AniStar'

        if (it.type === 'anime-serial') {
            // first remove crap from seasons
            for (let n of Object.keys(it.seasons)) {
                if (it.seasons[n].title && !it.seasons[n].title.match(/сезон/i)) {
                    it.episodes_count -= Object.keys(it.seasons[n]).length
                    delete it.seasons[n]
                }
            }
            // if multiple or 0 seasons left then well fuck it
            if (Object.keys(it.seasons).length !== 1) {
                ctx.log('messed up release: %o', it)
                continue
            }

            let lastSavedEpisode = await kv.get(`kodik-ls:${it.id}`, 0)
            for (let season of Object.values(it.seasons)) {
                let maxEpisode = -1
                for (let [episode_, url] of Object.entries(season.episodes)) {
                    let episode = parseInt(episode_)
                    if (episode <= lastSavedEpisode) continue

                    if (episode > maxEpisode) maxEpisode = episode
                    if (url.startsWith('//')) url = 'https:' + url

                    yield {
                        target_id,
                        target_type: 'anime',
                        kind,
                        lang: 'ru',
                        author: ctx.deps['common/parse-author'](author),
                        part: episode,
                        url: url + '?translations=false'
                    }
                }

                if (maxEpisode !== -1) {
                    await kv.set(`kodik-ls:${it.id}`, maxEpisode)
                }
            }
        } else if (it.type === 'anime') {
            if (it.link.startsWith('//')) it.link = 'https:' + it.link

            yield {
                target_id,
                target_type: 'anime',
                kind,
                lang: 'ru',
                author: ctx.deps['common/parse-author'](kind),
                part: 1,
                url: it.link + '?translations=false'
            }
        }

        await kv.set('kodik-ls', it.updated_at)
    }
}
