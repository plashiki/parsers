import { ParserContext } from '../../../types/ctx'

export const provide = ['services/vk-video', 'common/regex-adapter']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/vk-video']({
        owner: -87232209,
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^(?:\[(.+?)\])?(?: ?(.+?) [\\\/])* ?(.+?) *\[ *(\d+)(?: *\(\d+\))?(?: из (?:\d+|[xXхХ]{2,3}))?(?: *\(\d+\))? *\] *[(\[](.+?)[)\]]$/i,
                target: v => v.title,
                fields: {
                    target: m => [m[2], m[3]],
                    part: m => m[4],
                    kind: 'dub',
                    lang: 'ru',
                    author: m => (m[1] || '') + (m[5] || '')
                }
            }
        ])
    })
}
