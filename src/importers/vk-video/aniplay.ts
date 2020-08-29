import { ParserContext } from '../../../types/ctx'

export const provide = ['services/vk-video', 'common/regex-adapter']
export const storage = ['vkv-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/vk-video']({
        owner: -64292596,
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^(.+?)(?: \/ .+)? (?:[-—] )?(\d+)(?: *\(\d+\))? (?:[сc][еe]рия)?(?: END)?(?: (\d+) сезон )?(?: *\(\d+\))? *\[(?:[pPрР]усск(?:ие|ая) |двухголосная )?([сСcC]убтитры|озвучка) (.+?)\](?: *(.+?)(?: \[.+)?|$)$/i,
                target: v => v.title,
                fields: {
                    target: m => [
                        m[6],
                        m[1] + (m[3] && m[3] !== '1' ? ' ' + m[3] : '')
                    ],
                    part: m => m[2],
                    kind: m => m[4] === 'озвучка' ? 'dub' : 'sub',
                    lang: 'ru',
                    author: m => m[5] || 'AniPlay.TV'
                }
            }
        ])
    })
}
