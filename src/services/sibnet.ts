import { ParserContext } from '../../types/ctx'
import { ParserAdapter } from '../../types'

export interface SibnetVideo {
    id: number
    title: string
    url: string

    getDescription (): Promise<string>
}

export interface SibnetImporterOptions<T> {
    owner: string

    adapter: ParserAdapter<SibnetVideo, T>
}

export function entry (ctx: ParserContext): Function {
    const urlSymbol = Symbol.for('item-url')

    return async function * <T> (options: SibnetImporterOptions<T>): AsyncIterable<T> {
        // sn-ls = sibnet, last saved
        const storage = `sn-ls:${ctx.rootUid}`
        const backlog: SibnetVideo[] = []
        let page = 1
        let backlogIndex: Record<number, true> = {}
        const lastSaved = await ctx.libs.kv.get(storage, 0)
        ctx.debug('lastSaved = %d', lastSaved)

        rootLoop:
            while (true) {
                const html = await ctx.libs.fetch(
                    `https://video.sibnet.ru/users/${encodeURIComponent(options.owner)}/video/?sort=0&page=${page}`, {
                        method: 'GET',
                        headers: {
                            // 2000iq hack to get more videos at once
                            'Cookie': '_video_session=dmlkZW9vbnBhZ2V8aToxMDAwMDAwMDtlOTYwMDFhNDE4OWM2NWRjNDExNDVjYz' +
                                'MzMDEwNzc5NGY5ZDZhOWQyZDM4ZDk4MmM4MjM3OGUzMmQ0ZWQ3NDRh'
                        }
                    }).then(i => {
                    if (i.status !== 200) ctx.log('http %d', i.status)

                    return i.buffer()
                }).then(i => ctx.libs.iconv.decode(i, 'win1251'))

                const $ = ctx.libs.cheerio.load(html)

                const realPage = parseInt($('.multipagesnavig>b:nth-of-type(2)').text())
                if (realPage !== page) break

                const items = $('.video_cell>.preview>a').toArray()

                if (items.length === 0) {
                    break
                }

                for (let it of items) {
                    let titleParts = it.attribs.title.split(' - ')
                    titleParts.pop()
                    const title = titleParts.join(' - ')
                    const m = it.attribs.href.match(/\/video(\d+)(?:[\-?#]|$)/i)
                    if (!m) {
                        ctx.log('failed to parse ID, url: %s', it.attribs.href)
                        continue
                    }
                    const id = parseInt(m[1])

                    if (id <= lastSaved) {
                        break rootLoop
                    }
                    if (!backlogIndex[id]) {
                        // no duplicates!!
                        backlogIndex[id] = true
                        let item = {
                            id,
                            title,
                            url: 'https://video.sibnet.ru/shell.php?videoid=' + id,
                            __cachedDescription: null as string | null,

                            async getDescription (): Promise<string> {
                                if (item.__cachedDescription !== null) {
                                    return item.__cachedDescription
                                }
                                return ctx.libs.fetch(it.attribs.href)
                                    .then(i => i.buffer())
                                    .then((buf) => {
                                        const html = ctx.libs.iconv.decode(buf, 'win1251')
                                        const $ = ctx.libs.cheerio.load(html)

                                        const val = $('meta[property="og:description"]').attr('content') || ''
                                        item.__cachedDescription = val
                                        return val
                                    })
                            }
                        }
                        backlog.push(item)
                    }
                }

                ctx.debug('loaded %d items', backlog.length)

                if (isNaN(realPage)) break
                page += 1
            }

        // reset index because we dont need it anymore
        backlogIndex = {}

        // now `backlog` only contains new items.
        // process them one-by-one and kv.set after each
        // so we dont lose any items
        while (backlog.length) {
            const item = backlog.pop()
            if (!item) break

            item[urlSymbol] = item.url

            const ret = await options.adapter(item)
            yield * ret
            ctx.stat()

            await ctx.libs.kv.set(storage, item.id)
        }
    }
}
