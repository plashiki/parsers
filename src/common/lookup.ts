import { LookupOptions, MediaMeta, MediaType } from '../../types'
import { ParserContext } from '../../types/ctx'

interface LookupFactoryOptions<T, V> {
    name: string

    search (mediaType: MediaType, name: string): Promise<T>

    getIterable (res: T): V[]

    getNames (it: V): string[]

    getPrimaryName (it: V): string

    getId (it: V, data: T): number | null | Promise<number | null>
}

export function entry (ctx: ParserContext): Function {
    const CONFLICTING_RESULT = Symbol('CONFLICTING_RESULT')

    const threshold = parseInt(process.env.FUZZY_THRESHOLD!)
    let mkIndex = (s: string): Record<string, 1> => s.split('').reduce((a, b) => {
        a[b] = 1
        return a
    }, {})
    let removeChars = mkIndex('«»\'"‘’“”„「」『』《》〈〉()\\[\\]{}<>-_⁓‐‑‒–—―`~!@#$%^&*;:.,\\/?|')
    let canLeaveInMiddle = mkIndex('⁓‐‑‒–—―.,;/\\$_-')
    let canLeaveOnEnd = mkIndex('!?\'.;*')

    let isWhitespace = s => s.match(/\s/)

    function normalizeString (s: string): string {
        if (!s) return ''

        let prevWhitespace = false
        let ret = ''
        const lastIndex = s.length - 1
        for (let i = 0; i <= lastIndex; i++) {
            let c = s[i].toLowerCase()
            let ws = isWhitespace(c)
            if (c in removeChars) {
                if (!prevWhitespace) {
                    if (i === lastIndex || isWhitespace(s[i + 1])) {
                        // end of word/string
                        if (c in canLeaveOnEnd) {
                            ret += c
                        }
                    } else {
                        if (c in canLeaveOnEnd) {
                            // middle or maybe one of last chars
                            // probably not the most efficient way, but kinda works (?)
                            let j = i + 1
                            while (s[j] in canLeaveOnEnd && j < lastIndex) {
                                j++
                            }
                            if (c in canLeaveInMiddle || j === lastIndex || isWhitespace(s[j])) {
                                ret += c
                            }
                        } else if (c in canLeaveInMiddle) {
                            // middle of word
                            ret += c
                        }
                    }
                }
                continue
            } else if (!prevWhitespace || prevWhitespace && !ws) {
                ret += c
            }
            prevWhitespace = isWhitespace(c)
        }

        return ret
            .replace(/oad/gi, 'ova')
            .replace(/(\d+)'?\s*(?:nd|th|st)?\s*season/i, (_, $1) => $1)
            .replace(/\s*сезон/gi, '')
            .replace(/(?:tv|тв)(?:[\-_⁓‐‑‒–—―]|\s*)1/gi, '')
            .replace(/(?:tv|тв)(?:[\-_⁓‐‑‒–—―]|\s*)(\d+)/gi, (_, $1) => $1)
            .replace(/продолжение|дважды/gi, '2')
            .replace(/демоны старшей школы/gi, 'старшая школа dxd')
            .replace(/ё/gi, 'е')
            .trim()
    }

    function shikimoriSearch (mediaType: MediaType, name: string): Promise<any[]> {
        return ctx.libs.fetch(`https://shikimori.one/api/${mediaType}s?${ctx.libs.qs.stringify({
            search: name,
            limit: 15
        })}&__=/autocomplete`, {
            headers: {
                'User-Agent': 'PlaShiki'
            }
        }).then(i => {
            if (i.status === 429) {
                return ctx.libs.sleep(400).then(() => shikimoriSearch(mediaType, name))
            }
            return i.json()
        })
    }

    function anilistSearch (mediaType: MediaType, name: string): Promise<any[]> {
        return ctx.libs.fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {
                'User-Agent': 'PlaShiki',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: 'query($name: String) {\n' +
                    '  Page(perPage: 15) {\n' +
                    '    media (search: $name, type: ' + (mediaType === 'anime' ? 'ANIME' : 'MANGA') + ') {\n' +
                    '      idMal\n' +
                    '      synonyms\n' +
                    '      title {\n' +
                    '        romaji\n' +
                    '        english\n' +
                    '        native\n' +
                    '      }\n' +
                    '    }\n' +
                    '  }\n' +
                    '}',
                variables: {
                    name
                }
            })
        }).then(i => {
            if (i.status === 429) {
                return ctx.libs.sleep(parseInt(i.headers['retry-after']) * 1000).then(() => anilistSearch(mediaType, name))
            }
            return i.json().then(i => i?.data?.Page?.media ?? [])
        })
    }

    function kitsuSearch (mediaType: MediaType, name: string): Promise<any> {
        return ctx.libs.fetch(`https://kitsu.io/api/edge/${mediaType}?${ctx.libs.qs.stringify({
            'filter[text]': name,
            'page[limit]': 15,
            'fields[anime]': 'titles,canonicalTitle,abbreviatedTitles,mappings',
            'include': 'mappings',
            'fields[mappings]': 'externalSite,externalId'
        })}`).then(i => i.json())
    }

    function malSearch (mediaType: MediaType, name: string): Promise<any[]> {
        return ctx.libs.fetch('https://api.myanimelist.net/v2/anime?' + ctx.libs.qs.stringify({
            q: name,
            fields: 'alternative_titles',
            limit: 15
        }), {
            headers: {
                'X-MAL-Client-ID': '6114d00ca681b7701d1e15fe11a4987e'
            }
        }).then(i => i.json()).then(i => i.data || [])
    }

    function googleShikimoriSearch (mediaType: MediaType, name: string): Promise<any[]> {
        return ctx.libs.fetch('https://serpapi.com/search.json?' + ctx.libs.qs.stringify({
            engine: 'google',
            q: `${mediaType} ${name} site:shikimori.one`,
            api_key: process.env.SERPAPI_TOKEN
        })).then(i => i.json()).then(i => i.organic_results || [])
    }

    // function anime365Search (mediaType: MediaType, name: string): Promise<any[]> {
    //     if (mediaType === 'manga') return Promise.resolve([])
    //     return ctx.libs.fetch('https://smotret-anime.ru/api/series/?' + ctx.libs.qs.stringify({
    //         query: name,
    //         fields: 'myAnimeListId,titles',
    //         limit: 15
    //     })).then(i => i.json()).then(i => {
    //         if (i.error) return []
    //         return i.data || []
    //     })
    // }

    function lookupFactory<T, V> (options: LookupFactoryOptions<T, V>): (mediaType: MediaType, names: string[]) => Promise<MediaMeta | null> {
        return async function lookup (mediaType: MediaType, names: string[]): Promise<MediaMeta | null> {
            let perNameMaxScoreBase: Record<string, number> = {}
            names.forEach((i) => {
                perNameMaxScoreBase[i] = 0
            })
            let minAcceptableScore = names.length * threshold * 0.6

            let flagsCache: Record<string, string> = {}
            let getNameFlags = (s: string): string => {
                if (s in flagsCache) return flagsCache[s]
                let digits = s.match(/[0-9]/g)?.join('') || ''
                let types = s.match(/o[vn]a|special|сп[еэ]шл|спецвыпуск|recap|рекап|movie|фильм|pv/gi) || []
                types = ctx.libs.objectUtils.uniqueBy(types.map(i =>
                    i.match(/o[vn]a/i) ? 'ova' :
                    i.match(/pv/i) ? 'pv' :
                    i.match(/special|сп[еэ]шл|спецвыпуск/i) ? 'special' :
                    i.match(/recap|рекап/i) ? 'recap' :
                    i.match(/movie|фильм/i) ? 'movie' :
                    'unknown'
                ))
                let ret = `${digits}_${types.sort().join(',')}`
                flagsCache[s] = ret
                return ret
            }

            let acronymsCache: Record<string, string> = {}
            let getAcronym = (s: string): string => {
                let meaningful = s.replace(/o[vn]a|special|сп[еэ]шл|спецвыпуск|recap|рекап|movie|фильм|pv/gi, '').trim()
                let words = meaningful.split(/\s+|[⁓‐‑‒–—―.,;/\$_\-]/g)
                let ret: string
                if (words.length < 2) {
                    ret = meaningful
                } else {
                    ret = words.map(i => i[0]).join('')
                }

                acronymsCache[s] = ret
                return ret
            }

            let hadConflict = false

            for (let name of names) {
                const data = await options.search(mediaType, name)
                const iter = options.getIterable(data)

                let maxScore = 0
                let scoreHistory: number[] = []
                let maxScoreItem: V | null = null

                for (let [i, it] of ctx.libs.objectUtils.enumerate(iter)) {
                    let itNames = options.getNames(it)
                    let perNameMaxScore = { ...perNameMaxScoreBase }
                    let positionCoefficient = 1 + 0.2 * ((iter.length - i) / Math.floor(iter.length / 2))

                    for (let itName of itNames) {
                        let itNameNorm = normalizeString(itName)
                        let itFlags = getNameFlags(itNameNorm)
                        let itAcronym = getAcronym(itNameNorm)

                        for (let n of names) {
                            let score = ctx.libs.fuzz.token_sort_ratio(itNameNorm, n, { full_process: false })
                            let flags = getNameFlags(n)
                            let acronym = getAcronym(n)

                            if (score < threshold && (itNameNorm === itAcronym || n === acronym)) {
                                let acrDist = ctx.libs.fuzz.distance(itAcronym, acronym, { full_process: false })
                                if (acrDist <= 1) {
                                    let acrScore = ctx.libs.fuzz.ratio(itAcronym, acronym, { full_process: false })
                                    if (acrScore > score) {
                                        score = acrScore
                                    }
                                }
                            }

                            if (itFlags === flags) score += 15

                            if (score > threshold && score > perNameMaxScore[n]) {
                                perNameMaxScore[n] = score
                            }
                        }
                    }

                    let totalScore = Object.values(perNameMaxScore).reduce((a, b) => a + b, 0)
                    totalScore *= positionCoefficient

                    ctx.debug('score = %f for names %o and item %o', totalScore, names, itNames)

                    scoreHistory.push(totalScore)
                    if (totalScore > maxScore) {
                        maxScore = totalScore
                        maxScoreItem = it
                    }
                }

                scoreHistory.sort((a, b) => b - a)
                if (scoreHistory.length > 2 && Math.abs(scoreHistory[0] - scoreHistory[1]) < 5) {
                    ctx.debug('close match: %o', scoreHistory)
                    hadConflict = true
                    continue
                }

                if (maxScoreItem && maxScore > minAcceptableScore) {
                    ctx.debug('%s found %s for names %o (score: %d)',
                        options.name, options.getPrimaryName(maxScoreItem), names, maxScore)
                    const id = await options.getId(maxScoreItem, data)
                    if (id === null) {
                        return null
                    }

                    return {
                        id,
                        type: mediaType
                    }
                }
            }

            if (hadConflict) {
                throw CONFLICTING_RESULT
            }

            return null
        }
    }

    const lookupFunctions = {
        shikimori: lookupFactory<any[], any>({
            name: 'shikimori',
            search: shikimoriSearch,
            getIterable: i => i,
            getNames (it: any): string[] {
                let ret: string[] = []
                if (it.name) ret.push(it.name)
                if (it.russian) ret.push(it.russian)
                return ret
            },
            getPrimaryName: it => it.name,
            getId: it => it.id
        }),
        anilist: lookupFactory<any[], any>({
            name: 'anilist',
            search: anilistSearch,
            getIterable: i => i,
            getNames (it: any): string[] {
                let ret: string[] = []
                if (it.title) ret.push(...Object.values(it.title) as any)
                if (it.synonyms) ret.push(...it.synonyms)
                return ret
            },
            getPrimaryName: it => it.title.romaji,
            getId: it => it.idMal
        }),
        kitsu: lookupFactory<any, any>({
            name: 'kitsu',
            search: kitsuSearch,
            getIterable: i => i.data,
            getNames (it: any): string[] {
                let ret: string[] = []
                if (it.attributes.titles) ret.push(...Object.values(it.attributes.titles) as any)
                if (it.attributes.canonicalTitle) ret.push(it.attributes.canonicalTitle)
                if (it.attributes.abbreviatedTitles) ret.push(...it.attributes.abbreviatedTitles)
                return ret
            },
            getPrimaryName: it => it.attributes.canonicalTitle,
            getId (it, data): number | null {
                let index: Record<number, true> = {}
                if (!it.relationships?.mappings?.data) return null

                // store mappings that refer to that anime in index
                it.relationships.mappings.data.forEach((it) => {
                    index[it.id] = true
                })

                for (let it of data.included) {
                    if (index[it.id] && it.attributes.externalSite.startsWith('myanimelist/')) {
                        return parseInt(it.attributes.externalId)
                    }
                }

                return null
            }
        }),
        mal: lookupFactory<any[], any>({
            name: 'mal',
            search: malSearch,
            getIterable: i => i,
            getNames (it: any): string[] {
                let ret: string[] = []
                if (it.node.title) ret.push(it.node.title)
                if (it.node.alternative_titles.en) ret.push(it.node.alternative_titles.en)
                if (it.node.alternative_titles.ja) ret.push(it.node.alternative_titles.ja)
                if (it.node.alternative_titles.synonyms) ret.push(...it.node.alternative_titles.synonyms)
                return ret
            },
            getPrimaryName: it => it.node.title,
            getId: it => it.node.id
        }),
        // anime365: lookupFactory<any[], any>({
        //     name: 'anime365',
        //     search: anime365Search,
        //     getIterable: i => i,
        //     getNames: it => Object.values(it.titles),
        //     getPrimaryName: it => it.titles.romaji,
        //     getId: it => it.myAnimeListId
        // })
        'google-shikimori': lookupFactory<any[], any>({
            name: 'google-shikimori',
            search: googleShikimoriSearch,
            getIterable: i => i.filter(i => i.link.match(/https?:\/\/shikimori\.one\/(?:animes|mangas|ranobe)\/[a-z]+(\d+)(?:[a-z-]+)?\/?$/i)),
            getNames: it => [it.title.split(/ \/ | \.\.\./)[0]],
            getPrimaryName: it => it.title.split(/ \/ | \.\.\./)[0],
            getId: it => it.link.match(/https?:\/\/shikimori\.one\/(?:animes|mangas|ranobe)\/[a-z]+(\d+)(?:[a-z-]+)?\/?$/i)![1]
        })
    }

    return async function (options: LookupOptions): Promise<MediaMeta | null> {
        // sanitize input
        let names = options.names.filter(i => i && i.trim() !== '')
        if (!names.length) {
            return null
        }
        // normalize and sort input
        // (usually ends up like this: (romaji/english => russian => japanese)
        names = names.map(i => normalizeString(i!)).sort()


        let queue = ['shikimori', 'kitsu', 'mal', 'anilist']
        let conflictResolveQueue = ['google-shikimori']
        if (options.preferredSearch) {
            if (Array.isArray(options.preferredSearch)) {
                queue = options.preferredSearch
            } else {
                let idx = queue.indexOf(options.preferredSearch)
                if (idx === -1) {
                    ctx.debug('unknown lookup service: %s', options.preferredSearch)
                } else {
                    queue.splice(idx, 1)
                    queue.unshift(options.preferredSearch)
                }
            }
        }

        for (let name of names) {
            const cached = await ctx.libs.kv.get<any>(`~lookup:${name}`, null)
            if (cached && cached.r >= Date.now()) {
                if (cached.v !== null) {
                    ctx.debug('cached %s %d for name %s', cached.v.type, cached.v.id, name)
                } else {
                    ctx.debug('cached null for name %s', name)
                }

                return cached.v
            }
        }

        let hadConflict = false

        for (let service of queue) {
            let media = null
            try {
                media = await lookupFunctions[service](options.mediaType ?? 'anime', names)
            } catch (e) {
                if (e === CONFLICTING_RESULT && !hadConflict) {
                    hadConflict = true

                    queue.push(...conflictResolveQueue)
                } else {
                    ctx.log('%s threw exception: %s', service, e.stack)
                }
            }
            if (media !== null) {
                for (let name of names) {
                    await ctx.libs.kv.set(`~lookup:${name}`, {
                        r: Date.now() + 604800000, // 1 week
                        v: media
                    })
                }

                return media
            } else {
                ctx.debug('nothing at %s', service)
            }
        }

        for (let name of names) {
            await ctx.libs.kv.set(`~lookup:${name}`, {
                r: Date.now() + 86400000, // 1 day
                v: null
            })
        }

        return null
    }
}
