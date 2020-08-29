import { ParserContext } from '../../../types/ctx'

export const provide = ['services/sibnet', 'common/regex-adapter']
export const storage = ['sn-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/sibnet']({
        owner: 'AniFilmTV',
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^(\d+) - (.+?)(?:\.{3})?(?: \/ (.+?))?(?: \| anifilm|$)/i,
                target: v => v.title,
                fields: {
                    target: m => [m[2], m[3]],
                    part: m => m[1],
                    kind: 'dub',
                    lang: 'ru',
                    author: 'AniFilm'
                }
            }
        ])
    })
}
