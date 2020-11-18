import { ParserContext } from '../../../types/ctx'

export const provide = ['services/sibnet', 'common/regex-adapter']
export const storage = ['sn-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/sibnet']({
        owner: 'bucherino',
        adapter: ctx.deps['common/regex-adapter']([
            {
                // look at dis duude
                regex: /^(.+?)(?: \/ (.+?))?(?: *(?:\[(?:\d+(?: (?:и(?:з(?: (?:\d+\+?(?:\])?)?)?)?)?)?)?)?)?(?:\S*\?)? - (\d+) серия/i,
                target: v => v.title,
                fields: {
                    target: m => [m[1], m[2]],
                    part: m => m[3],
                    kind: 'dub',
                    lang: 'ru',
                    author: 'AniDub'
                }
            },
            {
                regex: /^(?:\[(.+?)\] )?(.+?) [\/|] (.+?) (\[(\d+)\]|\((\d+) [cс]ерия\))(?: \[(.+?)\])?/i,
                target: v => v.title,
                fields: {
                    target: m => [
                        m[2].replace(/(\S)_(\S)/g, (_, $1, $2) => $1 + ' ' + $2),
                        m[3]
                    ],
                    part: m => m[5] || m[6],
                    kind: 'dub',
                    lang: 'ru',
                    author: m => ({
                        group: m[1],
                        people: m[7]
                    })
                }
            }
        ])
    })
}
