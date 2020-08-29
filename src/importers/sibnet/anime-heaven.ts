import { ParserContext } from '../../../types/ctx'

export const provide = ['services/sibnet', 'common/regex-adapter']
export const storage = ['sn-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/sibnet']({
        owner: 'Anime_Heaven',
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^(.+?) \/ (.+?)(?:\.{3})?(?: \/ (.+?)(?:\.{3})?)?(?: -)?(?: (\d+) сезон)? (\d+) серия(?: END)?(?: \[\d+\])?(?: END)? \((озвучка|субтитры)\)(?: \[(.+?)\])?(?: \[\d+\])?$/i,
                target: v => v.title,
                fields: {
                    target: m => [
                        m[1],
                        m[2] + (m[4] && m[4] !== '1' ? ' ' + m[4] : ''),
                        m[3]
                    ],
                    part: m => m[5],
                    kind: m => m[6].match(/субтитры/i) ? 'sub' : 'dub',
                    lang: 'ru',
                    author: m => m[7]
                }
            }
        ])
    })
}
