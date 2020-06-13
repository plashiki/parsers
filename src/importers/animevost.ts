import { ParserContext } from '../../types/ctx'
import { Translation } from '../../types'

interface AnimevostMeta {
    id: number
    url: string
    date: string
}

export const provide = ['common/lookup']

export async function * entry (ctx: ParserContext): AsyncIterable<Translation> {
    const domain = process.env.PRODUCTION ? 'animevost.org' : 'a49.agorov.org'

    const lastSaved = await ctx.libs.kv.get('avst-ls', '1970-01-01')
    ctx.debug('lastSaved = %s', lastSaved)

    const months = {
        'январь': '01',
        'февраль': '02',
        'март': '03',
        'апрель': '04',
        'май': '05',
        'июнь': '06',
        'июль': '07',
        'август': '08',
        'сентябрь': '09',
        'октябрь': '10',
        'ноябрь': '11',
        'декабрь': '12'
    }

    const parseDate = (s: string): string => {
        let [d, m, y] = s.split(' ')
        if (d.length === 1) d = '0' + d
        m = months[m]
        if (!m) {
            throw Error('Invalid month: ' + s)
        }
        return `${y}-${m}-${d}`
    }

    const backlog: AnimevostMeta[] = []
    let backlogIndex: Record<number, true> = {}

    let page = 1

    rootLoop:
        while (true) {
            const html = await ctx.libs.fetch(`https://${domain}/page/${page++}/`).then(i => i.text())
            const $ = ctx.libs.cheerio.load(html)

            const items = $('.shortstory').toArray()
            if (items.length === 0) {
                break
            }

            for (let it of items) {
                const el = $(it)

                let date = el.find('.staticInfoLeftData').text()
                date = parseDate(date)
                if (date < lastSaved) break rootLoop

                const a = el.find('.shortstoryHead a')
                let url = a.attr('href')
                const title = a.text()
                if (url == null || title == null) {
                    ctx.debug('cannot find <a>')
                    continue
                }

                if (url.startsWith('//')) url = 'https:' + url
                if (url.startsWith('/')) url = 'https://' + domain + url

                const m = url.match(/\/tip\/[a-z-]+\/(\d+)/)
                if (!m) {
                    ctx.debug('cannot parse id: %s', url)
                    continue
                }
                const id = parseInt(m[1])

                if (!(id in backlogIndex)) {
                    backlogIndex[id] = true
                    backlog.push({
                        id,
                        url,
                        date
                    })
                }
            }

            ctx.debug('loaded %d items', backlog.length)
        }

    backlogIndex = {}

    while (backlog.length) {
        const it = backlog.pop()
        if (!it) break

        const html = await ctx.libs.fetch(it.url).then(i => i.text())
        const $ = ctx.libs.cheerio.load(html)
        const title = $('.shortstoryHead').text().trim()
        let m = title.match(/^(.+?) \/ (.+?) \[\d+(?:-\d+)? из \d+\+?\](?: \[\d+ серия - \d+ \S+?\])?$/i)
        if (!m) {
            ctx.log('did not match: %s', title)
            continue
        }

        const [, russian, original] = m

        const lastSavedEpisode = await ctx.libs.kv.get(`avst-ls:${it.id}`, 0)
        m = html.match(/data\s*=\s*({.+?})/)
        if (!m) {
            ctx.log('did not found data: %s', it.url)
            continue
        }
        const data = JSON.parse(m[1].replace(',}', '}'))

        const meta = await ctx.deps['common/lookup']({
            names: [original, russian],
            preferredSearch: 'anime365'
        })
        if (!meta) {
            ctx.debug('lookup failed')
            continue
        }

        let proms: Promise<Translation | null>[] = []

        let maxEpisode = 0
        for (let [key, value] of Object.entries(data)) {
            let n = parseInt(key.replace(/[^-0-9]/gim, ''))
            if (n > lastSavedEpisode) {
                if (n > maxEpisode) maxEpisode = n
                proms.push(
                    ctx.libs.fetch(`https://${domain}/frame2.php?play=${value}`)
                        .then(i => i.text())
                        .then((html) => {
                            const $ = ctx.libs.cheerio.load(html)
                            let url = $('iframe').attr('src')
                            if (!url) return null
                            if (url.startsWith('//')) url = 'https:' + url

                            return {
                                target_id: meta.id,
                                target_type: 'anime',
                                part: n,
                                kind: 'dub',
                                lang: 'ru',
                                author: 'AnimeVost',
                                hq: true,
                                url
                            }
                        })
                )
            }
        }

        let res = await Promise.all(proms)

        yield * res.filter(i => i !== null) as Translation[]

        await ctx.libs.kv.set(`avst-ls:${it.id}`, maxEpisode)
        await ctx.libs.kv.set('avst-ls', it.date)
    }
}
