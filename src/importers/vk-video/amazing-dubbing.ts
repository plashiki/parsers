import { ParserContext } from '../../../types/ctx'

export const provide = ['services/vk-video', 'common/regex-adapter']
export const storage = ['vkv-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/vk-video']({
        owner: -126822319,
        adapter: ctx.deps['common/regex-adapter']([
            {
                regex: /^(?:\[\d+\+\] ?)?(Озвучка |\[Субтитры\] )?(\d+) серия (?:MVO ?|END ?)?\| ([^|]+?) (?:\| .+)* ?\[Amazing Dubbing\]$/,
                target: v => v.title,
                fields: {
                    target: m => m[3],
                    part: m => m[2],
                    kind: m => m[1] === '[Субтитры] ' ? 'sub' : 'dub',
                    lang: 'ru',
                    author: 'Amazing Dubbing'
                },
                moreUrls: [
                    function (v) {
                        let m
                        if ((m = v.description.match(/^Ссылка на скачивание: https?:\/\/(?:www\.)?myvi\.top\/[a-zA-Z0-9]+\?v=(.+)$/m))) {
                            return ['https://www.myvi.top/embed/' + m[1]]
                        }

                        return []
                    }
                ]
            }
        ])
    })
}
