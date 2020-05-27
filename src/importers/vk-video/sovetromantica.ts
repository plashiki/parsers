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

export function entry (ctx: ParserContext) {
    const urlSymbol = Symbol.for('item-url')
    const hqSymbol = Symbol.for('item-hq')

    return ctx.deps['services/vk-video']({
        owner: -33905270,
        adapter: ctx.deps['common/compose']([
            async function (video: VkVideo): Promise<Translation[]> {
                const t = video.title.match(/^\[(озвучка|Дубляж|субтитры) \| (\d+(?: серия)?|фильм|спешл|OVA)(?: END)?\]/)
                if (!t) {
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
                let episode = (ep === 'фильм' || ep === 'спешл') ? 1 : parseInt(ep.substr(0, ep.length - 6))
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
                    hq: video[hqSymbol],
                    target_id: target.id,
                    target_type: target.type,
                    author: authors.length > 0 ? `SovetRomantica (${authors.join(', ')})` : 'SovetRomantica',
                    kind: kind as TranslationKind,
                    lang: 'ru',
                    part: episode,
                    url: video[urlSymbol]
                }
                const ret = [translation]

                let ownPlayer = video.description.match(/https?:\/\/sovetromantica\.com\/anime\/(\d+)\/episode_(\d+-(?:subtitles|dubbed))/)
                if (ownPlayer) {
                    let ownPlayerTranslation = ctx.libs.objectUtils.clone(translation)
                    translation.url = `https://sovetromantica.com/embed/episode_${ownPlayer[1]}_${ownPlayer[2]}`
                    ret.push(ownPlayerTranslation)
                }

                return ret
            },
            ctx.deps['common/anitomy-adapter']<VkVideo>({
                target: v => v.title,
                fallback: {
                    lang: 'ru',
                    author: 'SovetRomantica'
                }
            })
        ])
    })
}
