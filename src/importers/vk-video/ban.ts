import { ParserContext } from '../../../types/ctx'

export const provide = ['services/vk-video', 'common/regex-adapter']
export const storage = ['vkv-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/vk-video']({
        owner: -125588597,
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^(?:\[Озвучка\] )?\[(?:озвучка \| )?(\d+|[фФ]ильм)(?: серия)?(?: \| movie)?(?: *\(\d+\))?\] (.+?)(?: [\/|] (.+?))? (?:\[(?:\d+ [сСcC]ерия|MOVIE)\] (?:\[END\] )?\[(.+?)\]|\| (?:русская озвучка|by) (.+?)(?: \|.+)?)$/i,
                target: v => v.title,
                fields: {
                    target: m => [m[2], m[3]],
                    part: m => m[1].match(/фильм/i) ? 1 : m[1],
                    kind: 'dub',
                    lang: 'ru',
                    author: m => m[4] || m[5] || 'Ban'
                }
            },
            {
                regex: /^(\[.+?\] )?(.+?)(?: \/ (.+?))?(?: -)? (?:\(ban\) )?(?:[\[(])?(\d+)(?: из \d+\]|\))?(?: русская озвучка)?(?: серия)?(?: END)?(?: *\(рус\.озв\.Ban\)| *[\(\[](?:Озвучка(?: -)? )?(.+?)[\)\]])?(?: \[animaunt\.ru\]| \| BAN \|)?$/i,
                target: v => v.title,
                fields: {
                    target: m => [m[2], m[3]],
                    part: m => m[4],
                    kind: m => m[1]?.match(/субтитры/i) ? 'sub' : 'dub',
                    lang: 'ru',
                    author: m => m[5] || 'Ban'
                }
            }
        ])
    })
}
