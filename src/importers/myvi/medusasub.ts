import { ParserContext } from '../../../types/ctx'

export const provide = ['services/myvi', 'common/regex-adapter']
export const storage = ['mv-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/myvi']({
        owner: 'idr6bo',
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^\[MedusaSub\] (.+?)(?: \([A-Z]{3}\))? [-–] (\d+)(?: END)?( OVA)?/i,
                target: v => v.title,
                fields: {
                    target: m => m[1] + (m[3] || ''),
                    part: m => m[2],
                    kind: 'sub',
                    lang: 'ru',
                    author: 'MedusaSub'
                }
            }
        ])
    })
}
