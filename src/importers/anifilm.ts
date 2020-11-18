import { ParserContext } from '../../types/ctx'
import { MediaSeason, Translation } from '../../types'

interface AnifilmPlayer {
    id: string
    rid: string
    episode: string
    title: string
    iframe: string
    imageUrl: string
    from: string
}

interface AnifilmMeta {
    id: number
    updatedAt: string
    title: string
    secondary: string[]
    voices: string[]
    season: MediaSeason | null

    players: string[]
}

export const provide = ['common/lookup']
export const storage = ['aflm-ls%']

export async function * entry (ctx: ParserContext): AsyncIterable<Translation> {
    const { kv, fetch, cheerio } = ctx.libs

    const lastSaved = await kv.get('aflm-ls', '1970-01-01T00:00:00Z')
    let page = 1

    let backlog: AnifilmMeta[] = []
    let backlogIndex: Record<number, true> = {}

    const SEASONS: Record<string, MediaSeason['season']> = {
        'Зима': 'winter',
        'Весна': 'spring',
        'Лето': 'summer',
        'Осень': 'fall',
    }
    function parseSeason (s: string): MediaSeason | null {
        let [name, yearStr] = s.split(' ')
        let year = parseInt(yearStr)
        if (isNaN(year)) return null
        if (!(name in SEASONS)) return null

        return { season: SEASONS[name], year }
    }

    rootLoop:
        while (true) {
            const pageUrl = `https://anifilm.tv/releases/page/${page}`
            let html = await fetch(pageUrl).then(i => i.text())

            const $ = cheerio.load(html)
            if (parseInt($('.pagination__item--active').text()) !== page) break
            page += 1

            const items = $('.releases__item').toArray()

            for (let it of items) {
                const el = $(it)
                let url = el.find('.releases__title a').attr('href')
                if (!url) {
                    ctx.log('failed to find url')
                    continue
                }

                url = new URL(url, pageUrl).href

                let m = url.match(/releases\/(\d+)/)
                if (!m) {
                    ctx.log('failed to find id: %s', url)
                    continue
                }
                const id = parseInt(m[1])
                if (id in backlogIndex) continue
                backlogIndex[id] = true

                const page = await fetch(url).then(i => i.text())
                const $$ = cheerio.load(page)
                // it tends to use time with timezone, we dont want it
                const updatedAt = new Date($$('[itemprop=dateCreated]').text()).toISOString()
                if (updatedAt < lastSaved) {
                    break rootLoop
                }

                const title = $$('.release__title-primary').text()
                const secondary = $$('.release__title-second').children().toArray().map(it => $$(it).text())
                const seasonText = $$('.table-list__label:contains("Сезон")').parent().find('.table-list__value').text()
                const season = parseSeason(seasonText)

                let prop = $$('player-component').attr(':services_props')
                if (!prop) {
                    ctx.log('failed to find available players: %s', url)
                    continue
                }
                const players = Object.values(JSON.parse(prop))
                    .map(i => (i as any).from)
                    .filter(i => i !== 'trailer')

                backlog.push({
                    id,
                    updatedAt,
                    title,
                    secondary,
                    players,
                    season,
                    voices: $$('.release__work-item--voice>a').toArray().map(i => $(i).text())
                })
            }

            ctx.debug('loaded %d items (page %d)', backlog.length, page - 1)
        }

    backlogIndex = {}

    while (backlog.length) {
        const it = backlog.pop()
        if (!it) break

        const target = await ctx.deps['common/lookup']({
            names: [it.title, ...it.secondary],
            startSeason: it.season
        })
        if (!target) {
            ctx.log('lookup failed: %s, %t', it.title, it.secondary)
            continue
        }

        const players: AnifilmPlayer[][] = await Promise.all(
            it.players.map(
                (name) => fetch(`https://anifilm.tv/releases/api:online:${it.id}:${name}`)
                    .then(i => i.json() as Promise<AnifilmPlayer[]>)
            )
        )

        let data: Record<string, number | undefined> = await kv.getMany(it.players.map(i => `aflm-ls:${it.id}:${i}`))
        let lastSaved: Record<string, number> = {}
        for (let name of it.players) {
            lastSaved[name] = data[`aflm-ls:${it.id}:${name}`] ?? 0
        }

        for (let part of players) {
            for (let pl of part) {
                let last = lastSaved[pl.from]
                let n = parseInt(pl.episode)
                if (n > last) {
                    yield {
                        target_id: target.id,
                        target_type: 'anime',
                        part: n,
                        kind: 'dub',
                        lang: 'ru',
                        author: {
                            group: 'AniFilm',
                            people: it.voices
                        },
                        url: pl.iframe
                    }

                    await kv.set(`aflm-ls:${it.id}:${pl.from}`, n)
                }
            }
        }

        await kv.set('aflm-ls', it.updatedAt)
    }
}
