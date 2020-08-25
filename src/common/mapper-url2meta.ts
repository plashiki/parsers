import { ExternalService, MediaMeta, MediaType } from '../../types'
import { ParserContext } from '../../types/ctx'

type UrlRule = [RegExp, ExternalService, MediaType, number]

export const provide = [
    'services/tvdb-api'
]

export function entry (ctx: ParserContext): Function {
    const urlRules: UrlRule[] = [
        [/^(?:https?:)?\/\/(?:www\.)?animenewsnetwork\.com\/encyclopedia\/anime\.php\?id=(\d+)/i, 'ann', 'anime', 1],
        [/^(?:https?:)?\/\/(?:www\.)?animenewsnetwork\.com\/encyclopedia\/manga\.php\?id=(\d+)/i, 'ann', 'manga', 1],
        [/^(?:https?:)?\/\/(?:www\.)?anidb\.(?:net|info)\/(?:perl-bin\/animedb\.pl\?show=anime&aid=|anime\/)(\d+)/i, 'anidb', 'anime', 1],
        [/^(?:https?:)?\/\/(?:www\.)?myanimelist\.net\/anime\/(\d+)/i, 'mal', 'anime', 1],
        [/^(?:https?:)?\/\/(?:www\.)?myanimelist\.net\/manga\/(\d+)/i, 'mal', 'manga', 1],
        [/^(?:https?:)?\/\/(?:www\.)?shikimori\.(?:one|org)\/animes\/[a-z]+(\d+)/i, 'mal', 'anime', 1],
        [/^(?:https?:)?\/\/(?:www\.)?shikimori\.(?:one|org)\/mangas\/[a-z]+(\d+)/i, 'mal', 'manga', 1],
        [/^(?:https?:)?\/\/(?:www\.)?shikimori\.(?:one|org)\/ranobe\/[a-z]+(\d+)/i, 'mal', 'manga', 1],
        [/^(?:https?:)?\/\/(?:www\.)?allcinema\.net\/cinema\/(\d+)/i, 'allcinema', 'anime', 1],
        [/^(?:https?:)?\/\/(?:www\.)?allcinema\.net\/prog\/show_c\.php\?num_c=(\d+)/i, 'allcinema', 'anime', 1],
        [/^(?:https?:)?\/\/(?:www\.)?fansubs.ru\/base\.php\?id=(\d+)/i, 'fansubs', 'anime', 1],
        [/^(?:https?:)?\/\/(?:www\.)?world-art.ru\/animation\/animation\.php\?id=(\d+)/i, 'worldart', 'anime', 1],
        [/^(?:https?:)?\/\/(?:www\.)?world-art.ru\/animation\/manga\.php\?id=(\d+)/i, 'worldart', 'manga', 1],
        [/^(?:https?:)?\/\/(?:www\.)?kinopoisk\.ru\/film\/(\d+)/i, 'kp', 'anime', 1],
        [/^(?:https?:)?\/\/(?:www\.)?mangaupdates.com\/series\.html\?id=(\d+)/i, 'mangaupdates', 'manga', 1],
        [/^(?:https?:)?\/\/(?:www\.)?thetvdb\.com\/\?tab=series&id=(\d+)/i, 'thetvdb', 'anime', 1],
        [/^(?:https?:)?\/\/(?:www\.)imdb\.com\/title\/tt(\d+)/, 'imdb', 'anime', 1],
        [/^(?:https?:)?\/\/(?:www\.)(?:smotret-?anime|anime365|hentai365)\.(?:ru|onlnie)\/catalog\/[a-zA-Z0-9\-]+(\d+)(?:\/|$|\?)/, 'anime365', 'anime', 1],
    ]

    return async function (url: string): Promise<MediaMeta | null> {
        // urls containing id can be parsed right away
        for (const [regex, service, type, grp] of urlRules) {
            const match = url.match(regex)
            if (match) {
                return {
                    type,
                    id: {
                        service,
                        id: match[grp]
                    }
                }
            }
        }

        // tvdb by slug
        let m = url.match(/(?:https?:)?\/\/(?:www\.)?thetvdb\.com\/series\/([a-z0-9-]+)/i)
        if (m) {
            const it = await ctx.deps['services/tvdb-api'].getBySlug(m)
            if (!it) {
                return null
            }
            return {
                id: {
                    service: 'thetvdb',
                    id: it.id
                },
                type: 'anime'
            }
        }

        ctx.log('failed to map url: %s', url)

        return null
    }
}
