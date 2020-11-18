import { ParserContext } from '../../../types/ctx'

export const provide = ['services/sibnet', 'common/regex-adapter']
export const storage = ['sn-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/sibnet']({
        owner: 'Esmeralda Notr-dame',
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^\[­?(?:Zakuro Project|TAKEOVER)?(?:_RUS)?(?:\.SUB|\.DUB)?\](?: s\d+)?(?: ep(\d+))?(?: (\d+))?(?: END)? (.+?)(?: |-| - )(?:(\d+)\s*)?(?:END )?(?:[|—\/] (.+?))?(?: [|—\/] (.+?))?(?: s\s*\d+)?(?: ep\s*(\d+))?(?: END)?(?: русск(ая озвучка|ие субтитры))?(?: [\[(]­?(.+?)[\])])?$/i,
                target: v => v.title,
                fields: {
                    target: m => [m[3], m[5], m[6]],
                    part: m => m[1] || m[2] || m[4] || m[7],
                    kind: m => m[8]?.match(/субтитры/i) ? 'sub' : 'dub',
                    lang: 'ru',
                    author: m => ({
                        group: 'TAKEOVER Project',
                        people: m[9]
                    })
                }
            }
        ])
    })
}
