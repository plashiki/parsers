import { ParserContext } from '../../../types/ctx'

export const provide = ['services/vk-video', 'common/regex-adapter']
export const storage = ['vkv-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/vk-video']({
        owner: -164696397,
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^(?:\[(?:Озвучка )?Indie Dub\] )?(?:\([12]\d{3}г\.\) )?(.+?)(?: (\d+) сезон)?(?: (\d+) серия)?(?: *\/ *| *_ *)(.+?)(?: \d+)?(?: END)?$/i,
                target: v => v.title,
                fields: {
                    target: m => [
                        m[1] + (m[2] && m[2] !== '1' ? ' ' + m[2] : ''),
                        m[4]
                    ],
                    part: m => m[3] || '1',
                    kind: 'dub',
                    lang: 'ru',
                    author: 'Indie Dub'
                }
            }
        ])
    })
}
