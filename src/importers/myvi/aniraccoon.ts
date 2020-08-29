import { ParserContext } from '../../../types/ctx'

export const provide = ['services/myvi', 'common/regex-adapter']
export const storage = ['mv-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/myvi']({
        owner: 'id1p7o',
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^\[(sub|dub)\] (.+) \/ (.+) \/ (\d+) серия$/i,
                target: v => v.title,
                fields: {
                    target: m => [m[2], m[3]],
                    part: m => m[4],
                    kind: m => m[1],
                    lang: 'ru',
                    author: 'AniRaccoon'
                }
            }
        ])
    })
}
