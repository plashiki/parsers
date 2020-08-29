import { ParserContext } from '../../types/ctx'
import { ExternalServiceMappings, MapperResult } from '../../types'
import { FetchOneResult } from '../common/incremental-grab'

export const provide = [
    'common/incremental-grab',
    'common/mapper-url2meta'
]

export const storage = ['inc-ls:$UID']

export async function * entry (ctx: ParserContext) {
    const { sleep, fetch, iconv, cheerio } = ctx.libs

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36'
    }

    const fetchManga = (id: number, retryN = 0): Promise<FetchOneResult<MapperResult>> => {
        const url = 'http://www.world-art.ru/animation/manga.php?id=' + id
        return fetch(url, { headers })
            .then(i => i.buffer())
            .then(async (buf) => {
                const text = iconv.decode(buf, 'windows-1251')
                const $ = cheerio.load(text)
                if ($('meta[http-equiv=Refresh]').length) {
                    // invalid/non-existent id or flood wait, retry a few times
                    if (retryN === 3) return { item: null }
                    return sleep(250).then(() => fetchManga(id, retryN + 1))
                }

                const urls = $('b:contains("Сайты")')
                    .closest('tr')
                    .find('td.review > a.review').toArray()
                    .map(i => i.attribs.href)

                const mappings: ExternalServiceMappings = {}
                for (let href of urls) {
                    const meta = await ctx.deps['common/mapper-url2meta'](href)
                    if (meta) {
                        mappings[meta.id.service] = meta.id.id + ''
                    }
                }

                const match = $('font[size=5]').text().match(/\((манга|раноб[еэ])\)/)

                if (!match) {
                    return { item: null }
                }

                mappings.worldart = id + ''

                return {
                    item: {
                        mappings,
                        type: 'manga'
                    }
                }
            })
    }

    yield * ctx.deps['common/incremental-grab']({
        fetcher: fetchManga
    })
}
