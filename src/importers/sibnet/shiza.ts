import { ParserContext } from '../../../types/ctx'

export const provide = ['services/sibnet', 'common/regex-adapter']
export const storage = ['sn-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/sibnet']({
        owner: '[SHIZA]',
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^(?:\[(.+?)\] )?(.+?) [\/|] (.+?) \[(\d+)\](?: \[(.+?)\])?/i,
                target: v => v.title,
                fields: {
                    target: m => [m[2], m[3]],
                    part: m => m[4],
                    kind: m => m[5] === 'Subs' ? 'sub' : 'dub',
                    lang: 'ru',
                    author: m => ({
                        group: m[1],
                        people: m[5]
                    })
                }
            }
        ])
    })
}
