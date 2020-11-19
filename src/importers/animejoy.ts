import { ParserContext } from '../../types/ctx'
import { MediaMeta, MediaSeason, Translation } from '../../types'

interface AnimejoyMeta {
    id: string
    url: string
    updatedAt: string
    startSeason: MediaSeason | null
}

export const provide = ['common/lookup', 'common/mapper-url2meta']
export const storage = ['ajoy-ls%']

export async function * entry (ctx: ParserContext): AsyncIterable<Translation> {
    const { kv, fetch, cheerio } = ctx.libs

    // some pages require authorization, so account is optional but recommended.
    const headers = {
        Cookie: process.env.ANIMEJOY_AUTH,
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36'
    } as any

    const lastSaved = await kv.get('ajoy-ls', '1970-01-01T00:00:00Z')
    ctx.debug('lastSaved = %s', lastSaved)


    let page = 1
    let backlog: AnimejoyMeta[] = []
    let backlogIndex: Record<number, boolean> = {}

    rootLoop:
        while (true) {
            const pageUrl = `https://animejoy.ru/page/${page++}/`
            let html = await fetch(pageUrl, { headers }).then(i => i.text())
            const $ = cheerio.load(html)

            let items = $('.block.story')
            if (!items.length) break

            for (let node of items.toArray()) {
                let el = $(node)

                let a = el.find('.titleup h2 a')
                let url = a.attr('href')
                let title = a.text()

                if (!url) continue
                if (title.match(/анонс/i)) continue

                url = new URL(url, pageUrl).href

                let m = url.match(/\.ru\/(.+?\/(\d+))/)
                if (!m) {
                    ctx.log('no id found for %s', url)
                    continue
                }

                const id = m[1]

                if (id in backlogIndex) continue

                const startDateMatch = el.find('.zerop .timpact:contains("выпуска:")').parent().text().match(/^\s*(?:[cс]\s*)?(?:\?\?|\d{1,2}).(\d{1,2}).(\d{4})?/)
                let startSeason = startDateMatch ? ctx.deps['common/lookup'].parseDateToSeason(`01-${startDateMatch[1]}-${startDateMatch[2]}`) : null

                const updatedAt = await fetch(url, {
                    method: 'HEAD',
                    headers
                }).then(i => {
                    let date = new Date(i.headers.get('last-modified') || '')

                    if (isNaN(date as any)) {
                        return ''
                    }

                    return date.toISOString()
                })

                if (!updatedAt) {
                    ctx.log('no last-modified header at %s', url)
                    continue
                }

                if (updatedAt <= lastSaved) break rootLoop

                backlogIndex[id] = true
                backlog.push({
                    id,
                    url,
                    updatedAt,
                    startSeason
                })
            }

            ctx.debug('loaded %d items', backlog.length)
        }


    while (backlog.length) {
        let item = backlog.pop()
        if (!item) break

        const html = await fetch(item.url, { headers }).then(i => i.text())
        const $ = cheerio.load(html)

        let postTitle = $('#dle-content .titleup .ntitle').text().replace(/\s*\[.*$/i, '')
        let romajiTitle = $('#dle-content .titleup .romanji').text() // bro its not romanji bro

        let target: MediaMeta | null = null

        let externalUrl = $('.abasel .ansdb')
            .toArray()
            .map(i => $(i))
            .filter(
                i => i.text().match(/myanimelist|shikimori/i)
            )[0]?.attr('href')
        if (externalUrl) {
            target = await ctx.deps['common/mapper-url2meta'](externalUrl)
        }
        if (!target) {
            target = await ctx.deps['common/lookup']({
                names: [romajiTitle, postTitle],
                startSeason: item.startSeason
            })
        }
        if (!target || target.type !== 'anime') {
            ctx.log('didnt find: %s / %s', romajiTitle, postTitle)
            continue
        }

        let playlistElement = $('.playlists-ajax')
        if (!playlistElement.length) {
            ctx.log('no playlist at %s', item.url)
            continue
        }
        let xfName = playlistElement.data('xfname') // whatever xfname is.
        let newsId = playlistElement.data('news_id') // unsure if it may be different from post it, but whatever

        let playlistJson = await fetch(`https://animejoy.ru/engine/ajax/playlists.php?news_id=${newsId}&xfield=${xfName}`, { headers }).then(i => i.json())
        if (!playlistJson.success) {
            ctx.log('failed to get playlist for %s: %s', item.url, playlistJson.message)
            continue
        }
        let playlist$ = cheerio.load(playlistJson.response)
        let playlistItems = playlist$('.playlists-videos .playlists-items ul li').toArray()

        let maxEpisode = 0
        let lastSavedEpisode = await kv.get(`ajoy-ls:${item.id}`, 0)

        let mayBeMovie = playlist$('.playlists-lists .playlists-items').length === 0

        for (let node of playlistItems) {
            let el = $(node)

            let url = new URL(el.data('file'), item.url).href
            if (url.includes('video.animejoy.ru')) url = url.replace('video.animejoy.ru', 'start.u-cdn.top')

            let title = el.text()

            let m = title.match(/^(?:ova)?\s*(\d+)\s*(?:серия|ova)$/i)
            let episode: number
            if (!m) {
                if (mayBeMovie || title.match(/^(фильм|ova)$/i)) {
                    episode = 1
                } else {
                    ctx.log('did not match at %s: %s', item.url, title)
                    continue
                }
            } else {
                episode = parseInt(m[1])
            }
            if (episode <= lastSavedEpisode) continue
            if (episode > maxEpisode) maxEpisode = episode

            yield {
                target_id: target.id,
                target_type: 'anime',
                part: episode,
                kind: 'sub',
                lang: 'ru',
                author: {
                    // they sometimes translate themselves but usually it's just wakanim, and there's no way to detect that
                    group: url.includes('wakanim.tv') ? 'Wakanim' : undefined
                },
                url
            }
        }

        await kv.set(`ajoy-ls:${item.id}`, maxEpisode)
        await kv.set('ajoy-ls', item.updatedAt)
    }
}
