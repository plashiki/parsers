import { ParserContext } from '../../types/ctx'
import { MapperResult } from '../../types'

interface AnilistMedia {
    id: number
    idMal: number
    type: 'ANIME' | 'MANGA'
    updatedAt: number
}

export const storage = ['alst-ls']

export async function * entry (ctx: ParserContext): AsyncIterable<MapperResult> {
    const { kv, fetch, sleep } = ctx.libs

    const fetchPage = (page) => fetch('https://graphql.anilist.co/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: `{"query":"{Page(page:${page},perPage:50){pageInfo{hasNextPage,total}media(sort:UPDATED_AT_DESC,idMal_not:null){id idMal type updatedAt}}}","variables":null,"operationName":null}`
    }).then(i => {
        if (i.status === 429) {
            ctx.debug('rate limit, waiting %ds', i.headers['retry-after'])
            return sleep(parseInt(i.headers['retry-after']) * 1000).then(() => fetchPage(page))
        }

        return i.json()
    })

    const lastSaved = await kv.get('alst-ls', 0)
    ctx.debug('lastSaved = %d', lastSaved)
    let page = 1
    let backlog: AnilistMedia[] = []
    let backlogIndex: Record<number, true> = {}

    rootLoop:
        while (true) {
            const json = await fetchPage(page++)
            if (!json.data?.Page?.media) {
                ctx.log('no media: %o', json)
                break
            }

            let items = json.data.Page.media as AnilistMedia[]
            if (!items.length) break

            for (let it of items) {
                if (it.updatedAt <= lastSaved) break rootLoop
                if (!(it.id in backlogIndex)) {
                    backlogIndex[it.id] = true
                    backlog.push(it)
                }
            }

            ctx.debug('loaded %d/%d items', backlog.length, json.data.Page.pageInfo.total)

            if (!json.data.Page.pageInfo.hasNextPage) break
        }

    backlogIndex = {}

    while (backlog.length) {
        let it = backlog.pop()
        if (!it) break

        yield {
            type: it.type.toLowerCase(),
            mappings: {
                anilist: it.id + '',
                mal: it.idMal + ''
            }
        }

        await kv.set('alst-ls', it.updatedAt)
    }
}
