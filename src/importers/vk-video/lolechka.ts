import { ParserContext } from '../../../types/ctx'

export const provide = ['services/vk-video', 'common/regex-adapter']
export const storage = ['vkv-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/vk-video']({
        owner: -180168237,
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^(.+?) [-—] (\d+)(?: END)?$/,
                target: v => v.title,
                fields: {
                    target: m => m[1],
                    part: m => m[2],
                    kind: 'sub',
                    lang: 'ru',
                    author: 'лолечка'
                }
            }
        ])
    })
}
