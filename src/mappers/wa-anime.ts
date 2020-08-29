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

    const fetchAnime = (id: number, retryN = 0): Promise<FetchOneResult<MapperResult>> => {
        const url = 'http://www.world-art.ru/animation/animation.php?id=' + id
        return fetch(url, { headers })
            .then(i => i.buffer())
            .then(async (buf) => {
                const text = iconv.decode(buf, 'windows-1251')
                const $ = cheerio.load(text)

                // worldart is weird
                if ($('meta[http-equiv=Refresh]').length) {
                    // invalid id or flood wait, retry a few times
                    if (retryN === 3) return { item: null }
                    return sleep(250).then(() => fetchAnime(id, retryN + 1))
                }
                const canonical = $('link[rel=canonical]').attr('href')
                if (canonical === 'http://www.world-art.ru/animation/animation.php?id=1' && id !== 1) {
                    return {
                        item: null
                    }
                }

                // holy fuck
                const urls = $('td.bg2:contains("Сайты")')
                    .closest('table')
                    .next()
                    .nextAll('noindex')
                    .find('a').toArray()
                    .map(i => i.attribs.href)

                const mappings: ExternalServiceMappings = {}
                for (let href of urls) {
                    const meta = await ctx.deps['common/mapper-url2meta'](href)
                    if (meta) {
                        mappings[meta.id.service] = meta.id.id + ''
                    }
                }

                mappings.worldart = id + ''

                return {
                    item: {
                        mappings,
                        type: 'anime'
                    }
                }
            })
    }

    yield * ctx.deps['common/incremental-grab']({
        fetcher: fetchAnime,
        maxEmpty: 30
    })
}
