import { ParserContext } from '../../../types/ctx'

export const provide = ['services/vk-video', 'common/regex-adapter']
export const storage = ['vkv-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/vk-video']({
        owner: -151876221,
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^\[(Озвучка )?anirise\] *(.+?) (\d+)(?: END)? серия(?:(?: \/)? (.+?))?(?: \((.+?)\)|$)$/i,
                target: v => v.title,
                skip: v => !!v.title.match(/трейлер/i),
                fields: {
                    target: m => [m[2], m[4]],
                    part: m => m[3],
                    kind: m => m[1] || m[5]?.match(/озвучка/i) ? 'dub' : 'sub',
                    lang: 'ru',
                    author: m => m[1] ? m[5]?.match(/озвучка/i) ? 'AniRise' : m[5] : 'AniRise'
                }
            },
            {
                regex: /^(.+?) (\d+)(?: *\(\d+\))? серия \/ (.+?) (?:\| (.+?) \[|\([оО]звучка anirise\)|\[)/i,
                target: v => v.title,
                skip: v => !!v.title.match(/трейлер/i),
                fields: {
                    target: m => [m[1], m[3]],
                    part: m => m[2],
                    kind: 'dub',
                    lang: 'ru',
                    author: m => m[4] || 'AniRise'
                }
            },
            {
                regex: /^(.+?) (\d+) (OVA|серия)(?: \/ (.+?))? (?:\([pPрР]усская озвучка (.+?)\) (.+?)|\| [pPрР]усская озвучка (.+?))(?: \[anirise\]|$)/i,
                target: v => v.title,
                skip: v => !!v.title.match(/трейлер/i),
                fields: {
                    target: m => [
                        m[1] && m[1] + (m[3].match(/OVA/i) ? ' OVA' : ''),
                        m[6] && m[6] + (m[3].match(/OVA/i) ? ' OVA' : '')
                    ],
                    part: m => m[2],
                    kind: 'dub',
                    lang: 'ru',
                    author: m => m[5] || m[7] || 'AniRise'
                }
            }
        ])
    })
}
