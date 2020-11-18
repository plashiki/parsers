import { ParserContext } from '../../types/ctx'
import { Translation, TranslationKind } from '../../types'

interface AniraccoonMeta {
    url: string
    id: number

    updatedAt: string
}

export const provide = ['common/lookup']
export const storage = ['ls-anrc%']

export async function * entry (ctx: ParserContext): AsyncIterable<Translation> {
    const { kv, fetch, cheerio } = ctx.libs

    const lastSaved = await kv.get('ls-anrc', '1970-01-01T00:00:00')
    let page = 1
    let backlog: AniraccoonMeta[] = []
    let backlogIndex: Record<string, true> = {}

    rootLoop:
        while (true) {
            const pageUrl = `https://aniraccoon.com/anime/page/${page++}/`
            const html = await fetch(pageUrl).then(i => i.text())

            const $ = cheerio.load(html)
            const items = $('.movie').toArray()
            if (!items.length) break

            for (let it of items) {
                const el = $(it)
                const updatedAt = el.find('time').attr('datetime')
                let url = el.find('a').attr('href')
                if (!updatedAt || !url) {
                    ctx.log('couldn\'t find updatedAt or url')
                    continue
                }

                url = new URL(url, pageUrl).href
                if (updatedAt < lastSaved) {
                    break rootLoop
                }

                const m = url.match(/\/(\d+)-/)
                if (!m) {
                    ctx.log('url didnt match: %s', url)
                    continue
                }
                const id = parseInt(m[1])

                if (!(id in backlogIndex)) {
                    backlogIndex[id] = true
                    backlog.push({
                        id,
                        url,
                        updatedAt
                    })
                }
            }

            ctx.debug('loaded %d items', backlog.length)
        }

    backlogIndex = {}

    while (backlog.length) {
        const item = backlog.pop()
        if (!item) break

        const html = await fetch(item.url).then(i => i.text())
        const $ = cheerio.load(html)
        const title = $('.info_movie h1').text()
            .replace(/\s*\(субтитры\)\s*$/i, '')
        if (
            // ignore amvs and trailers
            !title.match(/amv|трейлер/i)
            // and doramas (if fsr they were included in results)
            || $('.label b:contains("Жанры")').closest('.info').html()?.match(/dorama|дорама/i)
        ) {
            const otherNames = $('.otherName').text().split(' / ')
            let author = $('.label b:contains("Озвучка")')
                .closest('.info')
                .text()
                .replace(/Озвучка:/i, '')
                .trim()
            if (author.match(/japanise/i)) {
                author = 'AniRaccoon'
            }
            if (author.match(/трейлер/i)) continue

            const target = await ctx.deps['common/lookup']({
                names: [title, ...otherNames]
            })
            if (!target) {
                ctx.log('lookup failed: %s %o', title, otherNames)
                continue
            }

            const content = $('.tab-panel script').toArray()
            for (let it of content) {
                const el = $(it)
                const tabTitle = $(`label[for=${$(`[aria-controls=${el.closest('.tab-panel').attr('id')}]`).attr('id')}]`).text()
                let kind: TranslationKind = 'dub'
                if (tabTitle.match(/субтитры/i)) kind = 'sub'

                const storage = `ls-anrc:${item.id}:${kind}`
                const lastSavedEpisode = await kv.get(storage, 0)

                const code = el.html()!.trim()
                if (code.startsWith('um.')) {
                    let exprs = code.split(/[;\n]/)
                        .filter(Boolean)
                        .map(i => i.trim())
                    let episode = 0

                    for (let expr of exprs) {
                        if (expr.startsWith('um.create')) {
                            episode = 0
                        } else if (expr.startsWith('um.uplay')) {
                            episode++
                            if (lastSavedEpisode < episode) {
                                const m = expr.match(/^um\.uplay\(\d+,"(.+?)"\)/)
                                if (!m) {
                                    ctx.log('expr did not match: %s (@ %s)', expr, item.url)
                                    continue
                                }
                                let url = m[1]
                                url = new URL(url, item.url).href

                                yield {
                                    target_id: target.id,
                                    target_type: 'anime',
                                    part: episode,
                                    kind,
                                    lang: 'ru',
                                    author: { group: author },
                                    url
                                }
                            }
                        } else {
                            ctx.log('unknown expression for um: %s (@ %s)', expr, item.url)
                        }
                    }

                    if (episode > lastSavedEpisode) {
                        await kv.set(storage, episode)
                    }
                } else if (code.startsWith('vk.')) {
                    let episode = 0
                    let m = code.match(/vk\.show\(\d+,\s*\[(\[.+?\])\]\)/)
                    if (!m) {
                        ctx.log('code did not match @ %s: %s', item.url, code)
                        continue
                    }
                    let links = m[1].substring(2, m[1].length - 2).split(/["']\s*,\s*['"]/)
                    for (let url of links) {
                        episode++

                        url = new URL(url, item.url).href

                        yield {
                            target_id: target.id,
                            target_type: 'anime',
                            part: episode,
                            kind,
                            lang: 'ru',
                            author: { group: author },
                            url
                        }
                    }
                } else {
                    ctx.log('unknown signature in code: %s', code)
                }
            }
        }

        await kv.set('ls-anrc', item.updatedAt)
    }
}
