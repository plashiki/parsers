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
    const threshold = parseInt(process.env.FUZZY_THRESHOLD!)
    let mkIndex = (s: string): Record<string, 1> => s.split('').reduce((a, b) => {
        a[b] = 1
        return a
    }, {})
    let removeChars = mkIndex('«»\'"‘’“”„「」『』《》〈〉()\\[\\]{}<>-_⁓‐‑‒–—―`~!@#$%^&*;:.,\\/?|')
    let canLeaveInMiddle = mkIndex('⁓‐‑‒–—―.,;/\\$_-')
    let canLeaveOnEnd = mkIndex('!?\'')

    let isWhitespace = s => s.match(/\s/)

    function normalizeString (s) {
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

        return ret.trim()
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
            return i.json().then(i => i.data.Page.media)
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
        }).then(i => i.json()).then(i => i.data)
    }

    function anime365Search (mediaType: MediaType, name: string): Promise<any[]> {
        if (mediaType === 'manga') return Promise.resolve([])
        return ctx.libs.fetch('https://smotret-anime.ru/api/series/?' + ctx.libs.qs.stringify({
            query: name,
            fields: 'myAnimeListId,allTitles',
            limit: 15
        })).then(i => i.json()).then(i => {
            if (i.error) return []
            return i.data
        })
    }

    function lookupFactory<T, V> (options: LookupFactoryOptions<T, V>): (mediaType: MediaType, names: string[]) => Promise<MediaMeta | null> {
        return async function lookup (mediaType: MediaType, names: string[]): Promise<MediaMeta | null> {
            for (let name of names) {
                const data = await options.search(mediaType, name)
                const iter = options.getIterable(data)

                let maxSimilarity = 0
                let maxSimilarityItem: V | null = null

                itemsLoop:
                    for (let it of iter) {
                        let itNames = options.getNames(it)

                        for (let itName of itNames) {
                            for (let n of names) {
                                let sim = ctx.libs.fuzz.ratio(normalizeString(itName), n, { full_process: false })
                                if (sim > maxSimilarity) {
                                    maxSimilarity = sim
                                    maxSimilarityItem = it
                                }
                                if (sim === 100) {
                                    // full match, immediately proceed
                                    break itemsLoop
                                }
                            }
                        }
                    }

                if (maxSimilarityItem && maxSimilarity > threshold) {
                    ctx.debug('shikimori found %s for names %o (similarity: %d)',
                        options.getPrimaryName(maxSimilarityItem), names, maxSimilarity)
                    const id = await options.getId(maxSimilarityItem, data)
                    if (id === null) {
                        return null
                    }

                    return {
                        id,
                        type: mediaType
                    }
                }
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
        anime365: lookupFactory<any[], any>({
            name: 'anime365',
            search: anime365Search,
            getIterable: i => i,
            getNames: it => it.allTitles,
            getPrimaryName: it => it.allTitles[0],
            getId: it => it.myAnimeListId
        })
    }

    return async function (options: LookupOptions): Promise<MediaMeta | null> {
        // sanitize input
        let names = options.names.filter(i => i && i.trim() !== '')
        if (!names.length) {
            return null
        }
        // normalize input
        names = names.map(i => normalizeString(i!))


        let queue = ['shikimori', 'anime365', 'kitsu', 'mal', 'anilist']
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

        for (let service of queue) {
            let media = null
            try {
                media = await lookupFunctions[service](options.mediaType ?? 'anime', names)
            } catch (e) {
                ctx.log('%s threw exception: %s', service, e.stack)
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
