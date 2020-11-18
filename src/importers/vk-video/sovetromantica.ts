import { ParserContext } from '../../../types/ctx'
import { VkVideo } from '../../services/vk-video'
import { Translation, TranslationKind } from '../../../types'

export const provide = [
    'services/vk-video',
    'common/lookup',
    'common/compose',
    'common/regex-adapter',
    'common/anitomy-adapter'
]
export const storage = ['vkv-ls:$UID']

export function entry (ctx: ParserContext) {
    const urlSymbol = Symbol.for('item-url')

    return ctx.deps['services/vk-video']({
        owner: -33905270,
        async adapter (video: VkVideo): Promise<Translation[]> {
            const t = video.title.match(/^\[(озвучка|Дубляж|субтитры) \| (\d+|фильм|спешл|OVA)(?: серия)?(?:(?: \|)? END)?\]/i)
            if (!t) {
                ctx.debug('did not match: %s', video.title)
                return []
            }
            let enTitle = video.description.match(/^Англоязычное название: (.+?)$/m)
            let ruTitle = video.description.match(/^Русское название: (.+?)$/m)
            if (!enTitle && !ruTitle) {
                enTitle = video.title.match(/^\[.+?] (.+?) \//)
            }

            const titles: string[] = []
            if (enTitle) {
                titles.push(enTitle[1])
            }
            if (ruTitle) {
                titles.push(ruTitle[1])
            }

            let [, kind, ep] = t
            kind = kind === 'субтитры' ? 'sub' : 'dub'
            let episode = ep.match(/фильм|спешл|ova/i) ? 1 : parseInt(ep)
            let authors: string[] = []
            for (let [, list] of video.description.matchAll(/^(?:Перевод|Редактура|Озвучка): (.+?)$/gm)) {
                const names = list.split(/ ?[,&] /g)
                names.forEach((name) => {
                    // remove vk links
                    const r = name.match(/^\[.+?\|(.+?)]$/)
                    if (r) {
                        authors.push(r[1])
                    } else {
                        authors.push(name)
                    }
                })
            }

            // resolve target media
            const target = await ctx.deps['common/lookup']({
                names: titles
            })
            if (!target) {
                ctx.debug('lookup failed')
                return []
            }

            const translation: Translation = {
                target_id: target.id,
                target_type: target.type,
                author: {
                    group: 'SovetRomantica',
                    people: authors
                },
                kind: kind as TranslationKind,
                lang: 'ru',
                part: episode,
                url: video[urlSymbol]
            }
            const ret = [translation]

            let ownPlayer = video.description.match(/https?:\/\/(?:www\.)?sovetromantica\.(?:com|moe)\/anime\/(\d+)\/episode_(\d+-(?:subtitles|dubbed))/)
            if (ownPlayer) {
                let ownPlayerTranslation = ctx.libs.objectUtils.clone(translation)
                translation.url = `https://sovetromantica.com/embed/episode_${ownPlayer[1]}_${ownPlayer[2]}`
                ret.push(ownPlayerTranslation)
            }

            return ret
        }
    })
}
