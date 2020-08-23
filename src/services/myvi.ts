import { ParserContext } from '../../types/ctx'
import { ParserAdapter } from '../../types'

export interface MyviVideo {
    channel: {
        id: string
        name: string
        defaultPreviewId: number
        detailUrl: string
    }
    createDate: number
    detailUrl: string
    duration: number
    previewUrl: string
    id: string
    title: string
    url: string

    __cachedDescription?: string

    getDescription (): Promise<string>
}

export interface MyviImporterOptions<T> {
    owner: string
    host?: string

    adapter: ParserAdapter<MyviVideo, T>
}

export function entry (ctx: ParserContext): Function {
    const { kv, fetch } = ctx.libs

    const urlSymbol = Symbol.for('item-url')

    return async function * <T> (options: MyviImporterOptions<T>): AsyncIterable<T> {
        // mv-ls = myvi, last saved
        const storage = `mv-ls:${ctx.rootUid}`
        let lastSaved = await kv.get(storage, 0)
        ctx.debug('lastSaved = %d', lastSaved)

        while (true) {
            const json = await fetch(
                `https://api.myvi.tv/api/1.0/videos/${options.owner}/channel?host=${options.host ?? 'www.myvi.tv'}&size=10000&sort=asc&d=${lastSaved}`,
                {
                    headers: {
                        accept: 'application/json'
                    }
                }
            ).then(i => {
                if (i.status !== 200) ctx.log('http %d', i.status)

                return i.json()
            })

            const items = json.elements as MyviVideo[]
            if (items.length === 0) break
            items.sort((a, b) => a.createDate - b.createDate)

            for (let vid of items) {
                vid[urlSymbol] = 'https://myvi.top/embed/' + vid.id
                vid.getDescription = async () => {
                    if (vid.__cachedDescription != undefined) return vid.__cachedDescription

                    return fetch(
                        `https://api.myvi.tv/api/1.0/channel/${options.owner}/detail?video_id=${vid.id}&featured_size=0&host=${options.host ?? 'www.myvi.tv'}`
                    )
                        .then(i => i.json())
                        .then(json => {
                            let description = json.featured[0]?.description ?? ''
                            vid.__cachedDescription = description

                            return description
                        })
                }

                const ret = await options.adapter(vid)
                yield * ret
                ctx.stat()

                lastSaved = vid.createDate
                await kv.set(storage, vid.createDate)
            }

            if (!json.prev) break
        }
    }
}
