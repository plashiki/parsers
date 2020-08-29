import { ParserContext } from '../../../types/ctx'

export const provide = ['services/sibnet', 'common/regex-adapter']
export const storage = ['sn-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/sibnet']({
        owner: 'Таканаши',
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^(\d+)(?: *\(\d+\))?(?: END)? серия (.+?) [-\/] (.+?)(?: [-\/] (.+?))? русская озвучка (.*?)$/i,
                target: v => v.title,
                fields: {
                    target: m => [m[2], m[3], m[4]],
                    part: m => m[1],
                    kind: 'dub',
                    lang: 'ru',
                    author: m => m[5] === 'MVO' ? '' : m[5]
                }
            }
        ])
    })
}
