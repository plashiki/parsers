import { ParserContext } from '../../types/ctx'
import { ExternalServiceMappings, MapperResult } from '../../types'
import { FetchOneResult } from '../common/incremental-grab'

export const provide = [
    'common/incremental-grab',
    'common/mapper-url2meta'
]

export async function * entry (ctx: ParserContext) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36'
    }

    const fetchOne = (id: number): Promise<FetchOneResult<MapperResult>> => {
        const url = 'http://www.fansubs.ru/base.php?id=' + id
        return ctx.libs.fetch(url, { headers })
            .then(i => i.buffer())
            .then(async (buf) => {
                const text = ctx.libs.iconv.decode(buf, 'windows-1251')
                if (text.match(/Нет данных на anime/)) {
                    return {
                        item: null
                    }
                }

                const $ = ctx.libs.cheerio.load(text)

                const urls = $('b:contains("Ссылки")')
                    .next('blockquote')
                    .find('a').toArray()
                    .map(i => i.attribs.href)

                if (!urls.length) return {
                    item: null
                }

                const mappings: ExternalServiceMappings = {
                    fansubs: id + ''
                }

                for (let href of urls) {
                    const meta = await ctx.deps['common/mapper-url2meta'](href)
                    if (meta) {
                        mappings[meta.name] = meta.id
                    }
                }

                return {
                    item: {
                        mappings,
                        type: 'anime'
                    }
                }
            })
    }

    yield * ctx.deps['common/incremental-grab']({
        fetcher: fetchOne,
        maxEmpty: 30
    })
}