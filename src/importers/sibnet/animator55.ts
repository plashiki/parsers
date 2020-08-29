import { ParserContext } from '../../../types/ctx'

export const provide = ['services/sibnet', 'common/regex-adapter']
export const storage = ['sn-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/sibnet']({
        owner: 'animator55',
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^(.+?) (?:(\d+)(?: серия)?|(?:S0*(\d+))?E(\d+))?(?: \(?(.+?)(?: Дубляж)?\)?)?$/i,
                target: v => v.title,
                fields: {
                    target: m => m[1] + (m[3] && m[3] !== '1' ? ' ' + m[3] : ''),
                    part: m => m[2] || m[4],
                    kind: 'dub',
                    lang: 'ru',
                    author: m => m[5]
                }
            }
        ])
    })
}
