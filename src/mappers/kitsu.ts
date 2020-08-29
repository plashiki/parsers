import { ParserContext } from '../../types/ctx'
import { ExternalService, MapperResult } from '../../types'

interface KitsuMapping {
    id: string
    type: 'mappings'
    attributes: {
        // both are iso timestamps
        createdAt: string | null
        updatedAt: string | null
        externalSite: string
        externalId: string
    }
    relationships: {
        item: {
            data: {
                type: string
                // id in their db
                id: string
            }
        }
    }
}

export const storage = ['kitsu-ls']

export async function * entry (ctx: ParserContext): AsyncIterable<MapperResult> {
    const { kv, fetch } = ctx.libs

    const aliases: Record<string, ExternalService> = {
        mangaupdates: 'mangaupdates',
        anidb: 'anidb',
        myanimelist: 'mal',
        anilist: 'anilist',
        animenewsnetwork: 'ann',
        thetvdb: 'thetvdb',
        trakt: 'trakt',
        mydramalist: 'mydramalist'
    }

    let lastSaved = await kv.get('kitsu-ls', '1970-01-01T00:00:00.000Z')
    let offset = 0
    let backlog: KitsuMapping[] = []
    let backlogIndex: Record<string, true> = {}


    rootLoop:
        while (true) {
            const json = await fetch(
                'https://kitsu.io/api/edge/mappings?page[limit]=20&sort=-updatedAt&include=item&fields[item]=id&page[offset]=' + offset
            ).then(i => i.json())
            if (json.errors) {
                ctx.log('errors: %o', json.errors)
            }
            offset += 20

            let items = json.data as KitsuMapping[]
            if (!items.length) break

            for (let mapping of items) {
                if (mapping.attributes.updatedAt && mapping.attributes.updatedAt <= lastSaved) break rootLoop
                if (!mapping.relationships?.item?.data) continue
                if (!(mapping.id in backlogIndex)) {
                    backlog.push(mapping)
                    backlogIndex[mapping.id] = true
                }
            }

            ctx.debug('loaded %d/%d', backlog.length, json.meta.count)
            if (!json.links.next) break
        }

    backlogIndex = {}

    while (backlog.length) {
        let mapping = backlog.pop()
        if (!mapping) break

        let type = mapping.relationships.item.data.type
        if (type !== 'anime' && type !== 'manga') {
            if (type !== 'people') {
                ctx.log('unknown type: %s', type)
            }
            continue
        }

        let [site, overrideType] = mapping.attributes.externalSite.split('/')
        if (site === 'hulu' || site === 'aozora') {
            // useless info, ignore
            continue
        }

        if (overrideType === 'anime' || overrideType === 'manga') {
            type = overrideType
        } else if (overrideType) {
            ctx.log('confusing site: %s', mapping.attributes.externalSite)
        }

        let externalId = mapping.attributes.externalId

        if (site === 'anilist' && externalId.includes('/')) {
            externalId = externalId.split('/')[1]
        }

        if (aliases[site]) {
            site = aliases[site]
        } else {
            ctx.log('unknown site: %s', site)
            continue
        }

        yield {
            type,
            mappings: {
                kitsu: mapping.relationships.item.data.id,
                [site]: externalId
            }
        }

        if (mapping.attributes.updatedAt) {
            await kv.set('kitsu-ls', mapping.attributes.updatedAt)
        }
    }

}
