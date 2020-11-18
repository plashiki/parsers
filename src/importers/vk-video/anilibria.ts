import { ParserContext } from '../../../types/ctx'

export const provide = [
    'services/vk-video',
    'common/compose',
    'common/regex-adapter',
    'common/anitomy-adapter'
]
export const storage = ['vkv-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/vk-video']({
        owner: -37468416,
        adapter: ctx.deps['common/compose']([
            ctx.deps['common/regex-adapter']([
                {
                    regex: /^(.+?)(?:\.\.\.)?(?: \/ (.+?))?(?: \/ (.+?))?\s?-\s?(\d+)(?: \(\d+\))?\s?серия\s?\|\s?(.+?)(?:\.\.\.)?(?: \(MVO\))?\s?\[AniLibria\.Tv\]$/,
                    target: v => v.title,
                    fields: {
                        target: m => [m[1], m[2], m[3]],
                        part: m => m[4],
                        author: m => `AniLibria (${m[5]})`,
                        kind: 'dub',
                        lang: 'ru'
                    }
                }
            ]),
            ctx.deps['common/anitomy-adapter']({
                target: v => v.title,
                override: {
                    author: { group: 'AniLibria' },
                    kind: 'dub',
                    lang: 'ru'
                }
            })
        ])
    })
}
