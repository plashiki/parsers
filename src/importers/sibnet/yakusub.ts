import { ParserContext } from '../../../types/ctx'

export const provide = ['services/sibnet', 'common/regex-adapter']
export const storage = ['sn-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/sibnet']({
        owner: 'Nika_Elrik',
        startFrom: 2185466,
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^(?:\((?:японские|корейские) имена\) )?(.+?)(?: (\d+)(?:\s*\(\d+\))?(?:\s*END)?)?(?: \/ (.+?)(?: \2(?:\s*END)?(?:\s*\(\d+\))?)?)?(?: \(\d+x\d+\))? \[русские субтитры\]/i,
                skip: v => !!v.title.match(/chico with honeyworks|\s(op|ed)(\d+)?\)|\((op|ed)(\d+)?\s|nowisee|insert song/i),
                target: v => v.title,
                fields: {
                    target: m => [m[1], m[3]],
                    part: m => m[2] || 1,
                    kind: 'sub',
                    lang: 'ru',
                    author: 'YakuSub Studio'
                }
            }
        ])
    })
}
