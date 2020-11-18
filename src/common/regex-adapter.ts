// regex-based importer adapter
// heavily based on older parsers engine

import { ParserContext } from '../../types/ctx'
import {
    ImporterTarget,
    ParserAdapter,
    Translation,
    TranslationAuthor,
    TranslationKind,
    TranslationLanguage,
} from '../../types'


type RegexFieldResolver<T, R> = ((match: RegExpMatchArray, item: T) => R | Promise<R>) | R

export interface RegexAdapterOptions<T> {
    /**
     * Regex which will be applied to `target`
     */
    regex: RegExp

    /**
     * If string -- used as `item`s key (nested are NOT supported).
     * If function, its return value is used
     * Example:
     * video => video.title.strip()
     */
    target: keyof T | ((item: T) => string | Promise<string>)

    fields: {
        // all fields are either a constant or a function which will resolve to field value

        target: RegexFieldResolver<T, string | string[] | ImporterTarget>

        part: RegexFieldResolver<T, number | string>

        // union types here add redundancy `as const` because of ts nature
        // dont break it ok? :D
        kind: RegexFieldResolver<T, string /* TranslationKind */>
        lang: RegexFieldResolver<T, string /* TranslationLanguage */>

        author: RegexFieldResolver<T, TranslationAuthor | string | string[]>
        url?: RegexFieldResolver<T, string>
    }

    /**
     * If this function returns true, item will be skipped and
     * this regex won't me tested. Optional.
     */
    skip?: (item: T) => boolean | Promise<boolean>

    moreUrls?: ((item: T, translation: Translation) => string | string[] | Promise<string | string[]>)[]
}

export const provide = ['common/lookup', 'common/fix-mixed-langs']

export function entry (ctx: ParserContext): Function {
    const urlSymbol = Symbol.for('item-url')
    const hqSymbol = Symbol.for('item-hq')
    const { objectUtils } = ctx.libs

    return function <T> (optionsArray: RegexAdapterOptions<T>[]): ParserAdapter<T, Translation> {
        return async function (item: T): Promise<Translation[]> {
            let ret: Translation[] = []
            let matched = false
            for (let [i, options] of objectUtils.enumerate(optionsArray)) {
                if (options.skip?.(item)) continue

                const matchTarget = typeof options.target === 'string'
                    ? item[options.target]
                    : await (options.target as Function)(item)
                const match = (matchTarget as string).match(options.regex)
                if (!match) {
                    continue
                }
                matched = true
                ctx.debug('%d regex matched: %o', i, match)

                const resolve = async <R> (field: RegexFieldResolver<T, R>): Promise<R> => {
                    if (!(field instanceof Function)) {
                        return field
                    }
                    return field(match, item)
                }

                let target = await resolve(options.fields.target)

                // shorthands for target resolve
                if (typeof target === 'string') {
                    target = {
                        names: [target]
                    }
                }
                if (Array.isArray(target)) {
                    target = {
                        names: target
                    }
                }

                // shorthand for numeric parts
                let part = await resolve(options.fields.part)
                if (typeof part === 'string') {
                    part = parseInt(part)
                }

                if (part <= 0 || isNaN(part)) {
                    ctx.log('Invalid part number: %d. Found at %o', part, item)
                    continue
                }

                // load url by symbol (if theres one)
                let url = ''
                if (urlSymbol in item) {
                    let val = item[urlSymbol]
                    // in case url is not available straight away
                    if (typeof val === 'function') {
                        url = await val()
                    } else {
                        url = val
                    }
                } else if ('url' in options.fields) {
                    let res = await resolve(options.fields.url)
                    if (res !== undefined) {
                        url = res
                    }
                } else {
                    ctx.log('No URL found. At %o', item)
                }

                // do target lookup
                if ('names' in target) {
                    // need lookup
                    target.names = target.names.map(s => s && ctx.deps['common/fix-mixed-langs'](s))
                    let result = await ctx.deps['common/lookup'](target)
                    if (!result) {
                        ctx.debug('lookup failed')
                        continue
                    } else {
                        target = result
                    }
                }

                let author = await resolve(options.fields.author)
                if (Array.isArray(author)) author = { people: author }
                if (typeof author === 'string') author = { group: author }
                if (typeof author.people === 'string') author.people = author.people.split(/[,;]|\s[и&]\s/gi)


                if (author.group) author.group = ctx.deps['common/fix-mixed-langs'](author.group)
                if (author.people) author.people = author.people.map(ctx.deps['common/fix-mixed-langs'])
                if (author.ripper) author.ripper = ctx.deps['common/fix-mixed-langs'](author.ripper)

                const translation: Translation = {
                    author: author,
                    kind: await resolve(options.fields.kind) as TranslationKind,
                    lang: await resolve(options.fields.lang) as TranslationLanguage,
                    part,
                    target_id: target.id,
                    target_type: target.type,
                    url
                }
                ret.push(translation)

                if (options.moreUrls) {
                    for (let func of options.moreUrls) {
                        let urls = await func(item, translation)
                        if (!Array.isArray(urls)) {
                            urls = [urls]
                        }
                        for (let url of urls) {
                            const tr = objectUtils.clone(translation)
                            tr.url = url
                            ret.push(tr)
                        }
                    }
                }

                if (ret.length) {
                    break
                }
            }

            if (!matched) {
                ctx.log('did not match: %o', item)
            }

            return ret
        }
    }
}
