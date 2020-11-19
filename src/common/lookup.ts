import { LookupOptions, MediaMeta, MediaSeason, MediaType } from '../../types'
import { ParserContext } from '../../types/ctx'

interface LookupFactoryOptions<T, V> {
    name: string

    search (mediaType: MediaType, name: string): Promise<T>

    getIterable (res: T): V[]

    getNames (it: V): string[]

    getPrimaryName (it: V): string

    getId (it: V, data: T): number | null | Promise<number | null>

    getSeasons (it: V): { start: MediaSeason | null, end: MediaSeason | null }
}

export type LookupInterface = ((options: LookupOptions) => Promise<MediaMeta | null>) & {
    parseDateToSeason (date: string | Date): MediaSeason
}

export const storage = ['~lookup:%']

export function entry (ctx: ParserContext): LookupInterface {
    const CONFLICTING_RESULT = Symbol('CONFLICTING_RESULT')
    const { kv, fetch, sleep, qs, objectUtils, fuzz } = ctx.libs

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

    function seasonsEqual (a: MediaSeason, b: MediaSeason): boolean {
        return a.year === b.year && (a.season === b.season || a.season === 'any' || b.season === 'any')
    }

    function getMonthSeason (month: number): MediaSeason['season'] {
        return month <= 2 || month == 12
            ? 'winter'
            : 3 <= month && month <= 5
                ? 'spring'
                : 6 <= month && month <= 8
                    ? 'summer'
                    : 'fall'
    }

    function parseDateToSeason (date: string | Date): MediaSeason {
        if (!(date instanceof Date)) date = new Date(date)
        const year = date.getFullYear()
        const month = date.getMonth() + 1
        const season = getMonthSeason(month)

        return { year, season }
    }

    function getCacheKey (name: string, options: LookupOptions): string {
        let parts = ['~lookup']

        if (options.startSeason) parts.push(`${options.startSeason.season}${options.startSeason.year}>`)
        if (options.endSeason) parts.push(`<${options.endSeason.season}${options.endSeason.year}`)

        // it would be better to check both of the previous keys, but im too lazy to implement that
        if (options.someSeason && !options.startSeason && !options.endSeason)
            parts.push(`<${options.someSeason.season}${options.someSeason.year}>`)

        parts.push(name)
        return parts.join(':')
    }

    function shikimoriSearch (mediaType: MediaType, name: string): Promise<any[]> {
        return fetch(`https://shikimori.one/api/${mediaType}s?${qs.stringify({
            search: name,
            limit: 15
        })}&__=/autocomplete`, {
            headers: {
                'User-Agent': 'PlaShiki'
            }
        }).then(i => {
            if (i.status === 429) {
                return sleep(400).then(() => shikimoriSearch(mediaType, name))
            }
            return i.json()
        })
    }

    function anilistSearch (mediaType: MediaType, name: string): Promise<any[]> {
        return fetch('https://graphql.anilist.co', {
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
                    '      startDate {\n' +
                    '        year\n' +
                    '        month\n' +
                    '      }' +
                    '      endDate {\n' +
                    '        year\n' +
                    '        month\n' +
                    '      }' +
                    '    }\n' +
                    '  }\n' +
                    '}',
                variables: {
                    name
                }
            })
        }).then(i => {
            if (i.status === 429) {
                return sleep(parseInt(i.headers['retry-after']) * 1000).then(() => anilistSearch(mediaType, name))
            }
            return i.json().then(i => i?.data?.Page?.media ?? [])
        })
    }

    function kitsuSearch (mediaType: MediaType, name: string): Promise<any> {
        return fetch(`https://kitsu.io/api/edge/${mediaType}?${qs.stringify({
            'filter[text]': name,
            'page[limit]': 15,
            'fields[anime]': 'titles,canonicalTitle,abbreviatedTitles,mappings,startDate,endDate',
            'include': 'mappings',
            'fields[mappings]': 'externalSite,externalId'
        })}`).then(i => i.json())
    }

    function malSearch (mediaType: MediaType, name: string): Promise<any[]> {
        return fetch('https://api.myanimelist.net/v2/anime?' + qs.stringify({
            q: name,
            fields: 'alternative_titles,start_date,end_date',
            limit: 15
        }), {
            headers: {
                'X-MAL-Client-ID': '6114d00ca681b7701d1e15fe11a4987e'
            }
        }).then(i => i.json()).then(i => i.data || [])
    }

    function googleShikimoriSearch (mediaType: MediaType, name: string): Promise<any[]> {
        return fetch('https://serpapi.com/search.json?' + qs.stringify({
            engine: 'google',
            q: `${mediaType} ${name} site:shikimori.one`,
            api_key: process.env.SERPAPI_TOKEN
        })).then(i => i.json()).then(i => i.organic_results || [])
    }

    // function anime365Search (mediaType: MediaType, name: string): Promise<any[]> {
    //     if (mediaType === 'manga') return Promise.resolve([])
    //     return fetch('https://smotret-anime.ru/api/series/?' + qs.stringify({
    //         query: name,
    //         fields: 'myAnimeListId,titles',
    //         limit: 15
    //     })).then(i => i.json()).then(i => {
    //         if (i.error) return []
    //         return i.data || []
    //     })
    // }

    function lookupFactory<T, V> (options: LookupFactoryOptions<T, V>): (mediaType: MediaType, names: string[], options: LookupOptions) => Promise<MediaMeta | null> {
        return async function lookup (mediaType: MediaType, names: string[], lookupOptions: LookupOptions): Promise<MediaMeta | null> {
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
                types = objectUtils.uniqueBy(types.map(i =>
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

                let history: [V, number][] = [] // (item, score) tuples
                let maxScoreItem: V | null = null

                for (let [i, it] of objectUtils.enumerate(iter)) {
                    let itNames = options.getNames(it)
                    let perNameMaxScore = { ...perNameMaxScoreBase }
                    let positionCoefficient = 1 + 0.2 * ((iter.length - i) / Math.floor(iter.length / 2))

                    for (let itName of itNames) {
                        let itNameNorm = normalizeString(itName)
                        let itFlags = getNameFlags(itNameNorm)
                        let itAcronym = getAcronym(itNameNorm)

                        for (let n of names) {
                            let score = fuzz.ratio(itNameNorm, n, { full_process: false })
                            let flags = getNameFlags(n)
                            let acronym = getAcronym(n)

                            if (score < threshold && (itNameNorm === itAcronym || n === acronym)) {
                                let acrDist = fuzz.distance(itAcronym, acronym, { full_process: false })
                                if (acrDist <= 1) {
                                    let acrScore = fuzz.ratio(itAcronym, acronym, { full_process: false })
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

                    history.push([it, totalScore])
                }

                history.sort((a, b) => b[1] - a[1])
                if (history.length > 2 && Math.abs(history[0][1] - history[1][1]) < 5) {
                    ctx.debug('close match: %o', history.map(i => i[1]))
                    hadConflict = true
                    continue
                }

                for (let [item, score] of history) {
                    if (score < minAcceptableScore) continue

                    if (lookupOptions.someSeason || lookupOptions.startSeason || lookupOptions.endSeason) {
                        let seasons = options.getSeasons(item)
                        if (lookupOptions.startSeason && (!seasons.start || !seasonsEqual(lookupOptions.startSeason, seasons.start))) continue
                        if (lookupOptions.endSeason && (!seasons.end || !seasonsEqual(lookupOptions.endSeason, seasons.end))) continue
                        if (lookupOptions.someSeason
                            && (
                                seasons.start && !seasonsEqual(lookupOptions.someSeason, seasons.start)
                                || seasons.end && !seasonsEqual(lookupOptions.someSeason, seasons.end)
                            )
                        ) continue
                    }

                    ctx.debug('%s found %s for names %o (score: %d)', options.name, options.getPrimaryName(item), names, score)
                    const id = await options.getId(item, data)
                    if (id === null) {
                        return null
                    }

                    return {
                        id: {
                            id,
                            service: 'mal'
                        },
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
            getId: it => it.id,
            getSeasons: it => ({
                start: it.aired_on ? parseDateToSeason(it.aired_on) : null,
                end: it.released_on ? parseDateToSeason(it.released_on) : null,
            })
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
            getId: it => it.idMal,
            getSeasons: it => ({
                start: it.startDate.year && it.startDate.month ? {
                    year: it.startDate.year,
                    season: getMonthSeason(it.startDate.month)
                } : null,
                end: it.endDate.year && it.endDate.month ? {
                    year: it.endDate.year,
                    season: getMonthSeason(it.endDate.month)
                } : null
            })
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
            },
            getSeasons: it => ({
                start: it.attributes.startDate ? parseDateToSeason(it.attributes.startDate) : null,
                end: it.attributes.endDate ? parseDateToSeason(it.attributes.endDate) : null,
            })
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
            getId: it => it.node.id,
            getSeasons: it => ({
                start: it.node.start_date ? parseDateToSeason(it.node.start_date) : null,
                end: it.node.end_date ? parseDateToSeason(it.node.end_date) : null,
            })
        }),
        // anime365: lookupFactory<any[], any>({
        //     name: 'anime365',
        //     search: anime365Search,
        //     getIterable: i => i,
        //     getNames: it => Object.values(it.titles),
        //     getPrimaryName: it => it.titles.romaji,
        //     getId: it => it.myAnimeListId
        // })
        // 'google-shikimori': lookupFactory<any[], any>({
        //     name: 'google-shikimori',
        //     search: googleShikimoriSearch,
        //     getIterable: i => i.filter(i => i.link.match(/https?:\/\/shikimori\.one\/(?:animes|mangas|ranobe)\/[a-z]+(\d+)(?:[a-z-]+)?\/?$/i)),
        //     getNames: it => [it.title.split(/ \/ | \.\.\./)[0]],
        //     getPrimaryName: it => it.title.split(/ \/ | \.\.\./)[0],
        //     getId: it => it.link.match(/https?:\/\/shikimori\.one\/(?:animes|mangas|ranobe)\/[a-z]+(\d+)(?:[a-z-]+)?\/?$/i)![1],
        //     getSeasons: () => ({ start: null, end: null })
        // })
    }

    const lookup: LookupInterface = async function (options: LookupOptions): Promise<MediaMeta | null> {
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
            if (!name) continue
            const cached = await kv.get<any>(getCacheKey(name, options), null)
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
                media = await lookupFunctions[service](options.mediaType ?? 'anime', names, options)
            } catch (e) {
                if (e === CONFLICTING_RESULT && !hadConflict) {
                    hadConflict = true

                    queue.push(...conflictResolveQueue)
                } else if (e !== CONFLICTING_RESULT) {
                    ctx.log('%s threw exception: %s', service, e.stack)
                }
            }
            if (media !== null) {
                for (let name of names) {
                    if (!name) continue
                    await kv.set(getCacheKey(name, options), {
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
            if (!name) continue
            await kv.set(getCacheKey(name, options), {
                r: Date.now() + 86400000, // 1 day
                v: null
            })
        }

        return null
    } as any

    lookup.parseDateToSeason = parseDateToSeason

    return lookup
}
