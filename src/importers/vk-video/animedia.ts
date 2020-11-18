import { ParserContext } from '../../../types/ctx'

export const provide = ['services/vk-video', 'common/regex-adapter']
export const storage = ['vkv-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/vk-video']({
        owner: -13912875,
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^([^|\/]+?)(?: [|\/] .+?)? [|\/] (.+?) - (\d+)/,
                target: v => v.title,
                skip: v => !!v.title.match(/трейлер|спешл|amv/i),
                fields: {
                    target: m => [m[1], m[2]],
                    part: m => m[3],
                    kind: 'dub',
                    lang: 'ru',
                    author: 'AniMedia'
                }
            },
            {
                regex: /^(?:\[\d+\+\] *)?([^|\/]+?)(?: [|\/] .+?)?(?: [|\/] (.+?))? \[(\d+)(?: *\(\d+\))?(?: *из (?:\d+|[xXхХ]{2,3})?)?(?: *\(\d+\))?\](?:(?: Озвучка (.+?))? \[(.+?)\])?/i,
                target: v => v.title,
                skip: v => !!v.title.match(/трейлер|спешл|amv/i),
                fields: {
                    target: m => [m[1], m[2]],
                    part: m => m[3],
                    kind: 'dub',
                    lang: 'ru',
                    author: m => ({
                        group: m[5] || 'AniMedia',
                        people: m[4]
                    })
                }
            },
            {
                regex: /^([^\/]+?) \/ (.+?) (?:- |\| )?(?:[сСcC]ери[яи] )?(\d+)(?: [сСcC]ери[яи])?(?: END)?(?: озвучка (.+?))?(?:$| - animedia\.tv| \[animedia\.tv\])/i,
                target: v => v.title,
                skip: v => !!v.title.match(/трейлер|спешл|amv/i),
                fields: {
                    target: m => [m[1], m[2]],
                    part: m => m[3],
                    kind: 'dub',
                    lang: 'ru',
                    author: 'AniMedia'
                }
            },
            {
                regex: /^([^\/]+?) \/ ([^|]+?) \| (\d+) [сС]ерия(?: - [оО]звучка (.+?))? \[/i,
                target: v => v.title,
                skip: v => !!v.title.match(/трейлер|спешл|amv/i),
                fields: {
                    target: m => [m[1], m[2]],
                    part: m => m[3],
                    kind: 'dub',
                    lang: 'ru',
                    author: m => m[4] || 'AniMedia'
                }
            }
        ])
    })
}
