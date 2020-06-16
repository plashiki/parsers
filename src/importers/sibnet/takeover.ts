import { ParserContext } from '../../../types/ctx'

export const provide = ['services/sibnet', 'common/regex-adapter']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/sibnet']({
        owner: 'Esmeralda Notr-dame',
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^\[­?(?:Zakuro Project|TAKEOVER)?(?:_RUS)?(?:\.SUB)?\](?: s\d+)?(?: ep(\d+))?(?: END)? (.+?)(?: |-| - )(?:(\d+)\s*)?(?:END )?(?:[|—] (.+?))?(?: [|—] (.+?))?(?: s\s*\d+)?(?: ep\s*(\d+))?(?: END)?(?: русск(ая озвучка|ие субтитры))?(?: [\[(]­?(.+?)[\])])?$/i,
                target: v => v.title,
                fields: {
                    target: m => [m[2], m[4], m[5]],
                    part: m => m[1] || m[3] || m[6],
                    kind: m => m[7]?.match(/субтитры/i) ? 'sub' : 'dub',
                    lang: 'ru',
                    author: m => 'TAKEOVER Project' + (m[8] ? ` (${m[8]})` : '')
                }
            }
        ])
    })
}
