import { ParserContext } from '../../../types/ctx'

export const provide = ['services/sibnet', 'common/regex-adapter']
export const storage = ['sn-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/sibnet']({
        owner: 'Ksandar87',
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^(.+?) (\d+)(?: \/ (.+) \2)? (?:Озв\.|Рус\.? озвучка)?\s*(.*)\s*$/i,
                target: v => v.title,
                fields: {
                    target: m => [m[1], m[3]],
                    part: m => m[2],
                    kind: 'dub',
                    lang: 'ru',
                    author: m => m[4]
                }
            }
        ])
    })
}
