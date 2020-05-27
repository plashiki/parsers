import { ParserContext } from '../../types/ctx'
import { AnitomyOptions } from '@teidesu/anitomy-js'
import { DynamicOptions, LookupOptions, ParserAdapter, Translation } from '../../types'

export interface AnitomyAdapterOptions<T> {
    /**
     * Values which will be referred to if anitomy doesnt return
     * some field.
     */
    fallback?: DynamicOptions<Translation, T>

    /**
     * Values which will override anitomy results.
     */
    override?: DynamicOptions<Translation, T>

    target: (item: T) => string

    /**
     * If this function returns true, item will be skipped.
     */
    skip?: (item: T) => boolean | Promise<boolean>

    options?: AnitomyOptions
    lookup?: LookupOptions

    // optional, by default will use urlSymbol
    getUrl?: (item: T) => string | Promise<string>
}

export const provide = ['common/lookup', 'common/fix-mixed-langs']

export function entry (ctx: ParserContext): Function {
    const urlSymbol = Symbol.for('item-url')

    return function <T> (options: AnitomyAdapterOptions<T>): ParserAdapter<T, Translation> {
        return async function (item: T): Promise<Translation[]> {
            if (options.skip?.(item)) return []

            const targetString = options.target(item)
            let ret: Partial<Translation> = {
                ...(await ctx.libs.resolveDynamicOptions(options.fallback || {}, item))
            }
            const lookup: LookupOptions = {
                names: [],
                ...(options.lookup || {})
            }
            const result = await ctx.libs.anitomy.parseAsync(targetString, options.options)
            ctx.debug('anitomy result: %o', result)

            if (result.anime_title) {
                let names = result.anime_title.split(/[\/\\|]/)
                if (names.length) {
                    lookup.names = names.map(s => ctx.deps['common/fix-mixed-langs'](s))
                } else {
                    return []
                }
            }

            if (result.episode_number) {
                ret.part = parseInt(result.episode_number)
            }

            if (result.language?.match(/рус|ru/i)) {
                ret.lang = 'ru'
            } else if (result.language?.match(/eng/i)) {
                ret.lang = 'en'
            } else if (result.language?.match(/ja?p/i)) {
                ret.lang = 'jp'
            }

            if (result.subtitles) {
                ret.kind = 'sub'
            } else if (result.dubbed) {
                ret.kind = 'dub'
            } else if (result.raw) {
                ret.kind = 'raw'
            }

            if (result.video_resolution) {
                ret.hq = !!result.video_resolution.match(/720|1080/)
            } else if (result.video_term) {
                ret.hq = !!result.video_term.match(/hd|hq/i)
            } else if (ret.hq === undefined) {
                // default fallback.
                ret.hq = false
            }

            if (result.release_group) {
                ret.author = ctx.deps['common/fix-mixed-langs'](result.release_group)
            } else if (!ret.author) {
                ret.author = ''
            }

            let urlResolver = options.getUrl ?? item[urlSymbol] as any
            if (!urlResolver) {
                ctx.log('cannot find url (@ anitomy)')
                return []
            }

            ret.url = urlResolver instanceof Function ? await urlResolver(item) : urlResolver

            // override
            ret = {
                ...ret,
                ...(await ctx.libs.resolveDynamicOptions(options.override ?? {}, item))
            }

            // check if all fields are there
            for (let key of ['part', 'kind', 'lang', 'author', 'url', 'hq']) {
                if (!(key in ret)) {
                    ctx.debug('field %s not found (@ anitomy)', key)
                    return []
                }
            }

            // now we can do lookup
            const target = await ctx.deps['common/lookup'](lookup)
            if (!target) {
                ctx.debug('lookup failed')
                return []
            }

            ret.target_id = target.id
            ret.target_type = target.type

            return [ret as any]
        }
    }
}
