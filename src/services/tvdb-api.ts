import { ParserContext } from '../../types/ctx'
import { AnyKV } from '../../types'

export function entry (ctx: ParserContext) {
    const { kv, fetch } = ctx.libs

    async function getToken (): Promise<string> {
        const old = await kv.get<any>('tvdb-token', null)
        if (old !== null && old.r >= Date.now()) {
            return old.t
        }

        return fetch('https://api.thetvdb.com/login', {
            body: JSON.stringify({
                apikey: process.env.TVDB_TOKEN,
                username: process.env.TVDB_USERNAME,
                userkey: process.env.TVDB_USERKEY
            })
        }).then(i => i.json()).then((it) => {
            kv.set('tvdb-token', JSON.stringify({
                t: it.token,
                r: Date.now() + 64800000 // 18 hours. token is valid for 24h, so just a precaution
            }))
            return it.token
        })
    }

    async function getBySlug (slug: string): Promise<AnyKV | null> {
        return getToken().then((token) => fetch(`https://api.thetvdb.com/search/series?slug=${slug}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })).then(i => i.json()).then((res) => {
            if (res.Error || !res.data?.length) return null
            return res.data[0]
        })
    }

    return {
        getToken,
        getBySlug
    }
}
