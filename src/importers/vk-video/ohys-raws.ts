import { ParserContext } from '../../../types/ctx'

export const provide = ['services/vk-video', 'common/anitomy-adapter']
export const storage = ['vkv-ls:$UID']

export function entry (ctx: ParserContext) {
    return ctx.deps['services/vk-video']({
        owner: -159388198,
        adapter: ctx.deps['common/anitomy-adapter']({
            target: v => v.title,
            // they also upload non-anime asian stuff under Exclusive-Raws
            skip: v => !v.title.match(/\[Ohys-Raws\]/),
            fallback: {
                author: { group: 'Ohys-Raws' },
                kind: 'raw',
                lang: 'jp',
            }
        })
    })
}
