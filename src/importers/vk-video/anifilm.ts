import { ParserContext } from '../../../types/ctx'

export const provide = ['services/vk-video', 'common/regex-adapter']
export const storage = ['vkv-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/vk-video']({
        owner: -18735882,
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^(\d+) ?-? ?([^|\/]+?) ?\/ ?([^|\/]+?)(?: *\(.+?\))?(?:$| ?\| ?AniFilm| ?\[)/i,
                target: v => v.title,
                fields: {
                    target: m => [m[2], m[3]],
                    part: m => m[1],
                    kind: 'dub',
                    lang: 'ru',
                    author: 'AniFilm'
                }
            },
            // regexes below are for older videos
            {
                regex: /^([^\/]+?) (?:- )?(\d+)?(?: серия)? *\/ *(.+?) (?:- )?(\d+)?(?: серия)?(?: \(Anifilm\.tv\))?(?: END)?(?:$|\[)/i,
                target: v => v.title,
                fields: {
                    target: m => [m[1], m[3]],
                    part: m => m[2] ?? m[4],
                    kind: 'dub',
                    lang: 'ru',
                    author: 'AniFilm'
                }
            },
            {
                regex: /^([^\/]+?)(?: \/ (.+?))? (?:\[TV\])?(?: ?\[\d+\])?\[(\d+) (?:[эЭ]пизод|(?:из|of) (?:\d+|[хХxX]{2}))\]/i,
                target: v => v.title,
                fields: {
                    target: m => [m[1], m[2]],
                    part: m => m[3],
                    kind: 'dub',
                    lang: 'ru',
                    author: 'AniFilm'
                }
            }
        ])
    })
}
