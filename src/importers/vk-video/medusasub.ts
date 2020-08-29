import { ParserContext } from '../../../types/ctx'

export const provide = ['services/vk-video', 'common/regex-adapter']
export const storage = ['vkv-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/vk-video']({
        owner: -158435497,
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^\[?MedusaSub\] (.+)? [|\-–]? (.+) [-–] (\d+)(?: END)? серия [-–] русские субтитры$/i,
                target: v => v.title,
                skip: v => !!v.title.match(/amv/i),
                fields: {
                    target: m => [m[1], m[2]],
                    part: m => m[3],
                    kind: 'sub',
                    lang: 'ru',
                    author: 'MedusaSub'
                }
            }
        ])
    })
}
