import { TranslationAuthor } from '../../types'

export function entry (): Function {
    // copy-pasted from backend yeah
    return function (author: string): TranslationAuthor {
        if (!author) return {}
        let match = author.match(/^(.+?)(?:\s+[[(](.+)[\])]|\s+на\s+.+)?$/) // holy fuck

        if (!match) return {
            group: author
        }

        let [, group, people] = match

        if (group.match(/[,;]|\s[и&]\s/)) {
            people = group
            group = ''
        }

        return {
            group,
            people: people?.split(/[,;]|\s[и&]\s/gi).map(i => i.trim()) ?? []
        }
    }
}
