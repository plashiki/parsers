import { ParserContext } from '../../types/ctx'
import { ParserAdapter } from '../../types'

export interface VkVideo {
    adding_date: number
    description: string
    id: number
    owner_id: number
    player: string
    title: string
    height: number
}

export interface VkImporterOptions<T> {
    owner: number

    adapter: ParserAdapter<VkVideo, T>
}

export function entry (ctx: ParserContext): Function {
    const urlSymbol = Symbol.for('item-url')
    const { kv, fetch, qs, sleep, normalizeUrl } = ctx.libs

    return async function * <T> (options: VkImporterOptions<T>): AsyncIterable<T> {
        // vkv-ls = vk video, last saved
        const storage = `vkv-ls:${ctx.rootUid}`
        const backlog: VkVideo[] = []
        let page = 0
        let backlogIndex: Record<number, true> = {}
        const lastSaved = await kv.get(storage, 0)
        ctx.debug('lastSaved = %d', lastSaved)

        rootLoop:
            while (true) {
                const json = await fetch('https://api.vk.com/method/video.get', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: qs.stringify({
                        v: '5.101',
                        access_token: process.env.VK_TOKEN,
                        owner_id: options.owner,
                        count: 200,
                        offset: (page++) * 200
                    })
                }).then(i => i.json())

                if (json.error) {
                    if (json.error.error_code === 6) {
                        await sleep(600)
                        ctx.log('a bit of rate limit for u')
                        continue
                    }
                    throw new Error('VK error: ' + json.error.error_msg)
                }

                const count = json.response.count as number
                const items = json.response.items as VkVideo[]

                if (items.length === 0) {
                    break
                }

                for (let it of items) {
                    if (it.adding_date <= lastSaved) {
                        break rootLoop
                    }
                    if (!backlogIndex[it.id]) {
                        // no duplicates!!
                        backlogIndex[it.id] = true
                        backlog.push(it)
                    }
                }

                ctx.debug('loaded %d/%d items', backlog.length, count)

                if (backlog.length === count) {
                    break
                }
            }

        // reset index because we dont need it anymore
        backlogIndex = {}

        // now `backlog` only contains new items.
        // process them one-by-one and kv.set after each
        // so we dont lose any items
        while (backlog.length) {
            const item = backlog.pop()
            if (!item) break
            if (!item.player) continue

            // provide common things
            item[urlSymbol] = normalizeUrl(item.player)

            const ret = await options.adapter(item)
            yield * ret
            ctx.stat()

            await kv.set(storage, item.adding_date)
        }
    }
}
