import { ParserContext } from '../../types/ctx'
import { Translation } from '../../types'

interface AnimejoyMeta {
    id: string
    url: string
    updatedAt: string
}

export const provide = ['common/lookup', 'common/mapper-url2meta']

export async function * entry (ctx: ParserContext): AsyncIterable<Translation> {
    // some pages require authorization, so account is optional but recommended.
    const headers = {
        Cookie: process.env.ANIMEJOY_AUTH
    } as any

    const lastSaved = await ctx.libs.kv.get('ajoy-ls', '1970-01-01T00:00:00Z')
    ctx.debug('lastSaved = %s', lastSaved)


    let page = 73
    let backlog: AnimejoyMeta[] = []
    let backlogIndex: Record<number, boolean> = {}

    rootLoop:
        while (true) {
            let html = await ctx.libs.fetch(`https://animejoy.ru/page/${page++}/`, { headers }).then(i => i.text())
            const $ = ctx.libs.cheerio.load(html)

            let items = $('.block.story')
            if (!items.length) break

            for (let node of items.toArray()) {
                let el = $(node)

                let a = el.find('.titleup h2 a')
                let url = a.attr('href')
                let title = a.text()

                if (!url) continue
                if (title.match(/анонс/i)) continue

                if (url.startsWith('//')) url = 'https:' + url
                if (url[0] === '/') url = 'https://animejoy.ru' + url

                let m = url.match(/\/(\d+)/)
                if (!m) {
                    ctx.log('no id found for %s', url)
                    continue
                }

                const id = m[1]

                if (id in backlogIndex) continue

                const updatedAt = await ctx.libs.fetch(url, {
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
                    updatedAt
                })
            }

            ctx.debug('loaded %d items', backlog.length)
        }


    while (backlog.length) {
        let item = backlog.pop()
        if (!item) break

        const html = await ctx.libs.fetch(item.url).then(i => i.text())
        const $ = ctx.libs.cheerio.load(html)

        let postTitle = $('#dle-content .titleup .ntitle').text().replace(/\s*\[.*$/i, '')
        let romajiTitle = $('#dle-content .titleup .romanji').text() // bro its not romanji bro

        let targetId: number = -1

        let externalUrl = $('.abasel .ansdb')
            .toArray()
            .map(i => $(i))
            .filter(
                i => i.text().match(/myanimelist|shikimori/i)
            )[0]?.attr('href')
        if (externalUrl) {
            let metaResult = await ctx.deps['common/mapper-url2meta'](externalUrl)
            if (metaResult) targetId = parseInt(metaResult.id)
        }
        if (targetId === -1) {
            let target = await ctx.deps['common/lookup']({
                names: [romajiTitle, postTitle]
            })
            if (!target) {
                ctx.log('didnt find: %s / %s', romajiTitle, postTitle)
                continue
            }
            targetId = target.id
        }

        let playlistElement = $('.playlists-ajax')
        if (!playlistElement) {
            ctx.log('no playlist at %s', item.url)
            continue
        }
        let xfName = playlistElement.data('xfname') // whatever xfname is.
        let newsId = playlistElement.data('news_id') // unsure if it may be different from post it, but whatever

        let playlistJson = await ctx.libs.fetch(`https://animejoy.ru/engine/ajax/playlists.php?news_id=${newsId}&xfield=${xfName}`, { headers }).then(i => i.json())
        if (!playlistJson.success) {
            ctx.log('failed to get playlist for %s: %s', item.url, playlistJson.message)
            continue
        }
        let playlist$ = ctx.libs.cheerio.load(playlistJson.response)
        let playlistItems = playlist$('.playlists-videos .playlists-items ul li').toArray()

        let maxEpisode = 0
        let lastSavedEpisode = await ctx.libs.kv.get(`ajoy-ls:${item.id}`, 0)

        let mayBeMovie = playlist$('.playlists-lists .playlists-items').length === 0

        for (let node of playlistItems) {
            let el = $(node)

            let url = el.data('file') as string
            if (url.startsWith('//')) url = 'https:' + url
            if (url.includes('video.animejoy.ru')) url = url.replace('video.animejoy.ru', 'start.u-cdn.top')

            let title = el.text()

            let m = title.match(/^(\d+)\s*серия$/i)
            let episode: number
            if (!m) {
                if (mayBeMovie) {
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
                target_id: targetId,
                target_type: 'anime',
                part: episode,
                kind: 'sub',
                lang: 'ru',
                author: 'AnimeJoy',
                hq: !url.match(/sibnet/i),
                url
            }
        }

        await ctx.libs.kv.set(`ajoy-ls:${item.id}`, maxEpisode)
        await ctx.libs.kv.set('ajoy-ls', item.updatedAt)
    }
}
