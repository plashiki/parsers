import { ParserContext } from '../../../types/ctx'

export const provide = ['services/vk-video', 'common/regex-adapter']
export const storage = ['vkv-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/vk-video']({
        owner: -34484100,
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^(.+?)(?: \/ (.+?))? \[(\d+)(?: *\(\d+\))? из (?:\d+\+?(?: *\(\d+\))?|[хХxX]{3})\](?: Озвучка (.+?))? \[© JAM CLUB\]$/i,
                target: v => v.title,
                skip: v => !!v.title.match(/amv/i),
                fields: {
                    target: m => [m[1], m[2]],
                    part: m => m[3],
                    kind: 'dub',
                    lang: 'ru',
                    author: m => m[4] || 'Jam'
                }
            }
        ])
    })
}
