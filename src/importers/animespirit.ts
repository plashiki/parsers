import { ParserContext } from '../../types/ctx'
import { MediaSeason, Translation, TranslationKind } from '../../types'

interface AnimespiritMeta {
    url: string
    updatedAt: string
}

export const provide = ['common/lookup', 'common/parse-author']
export const storage = ['aspr-ls%']

export async function * entry (ctx: ParserContext): AsyncIterable<Translation> {
    const { kv, fetch, cheerio, iconv } = ctx.libs

    const _3dTrash = /live action|dorama|дорам[аы]|д[yу]н[xх][yу][aа]/i

    const SEASONS: Record<string, MediaSeason['season']> = {
        'зима': 'winter',
        'весна': 'spring',
        'лето': 'summer',
        'осень': 'fall',
    }

    function prepareUrl (s: string): string | null {
        if (s.includes('rutube.ru') && s.includes('.iflv')) {
            s = 'https://video.rutube.ru/' + s.split('?v=')[1]
        } else if (s.includes('magnet:?')) {
            return null
        } else if (s.includes('myvi.ru') || s.includes('ourvideo.ru') || s.includes('netvi.ru')) {
            s = 'https://ourvideo.ru/player/embed/html/' + s.split('/').pop()
        } else if (s.includes('myvi.tv')) {
            s = 'https://www.myvi.tv/embed/' + s.split('/').pop()
        } else if (s.includes('video.i.ua')) {
            return null
        } else if (s.includes('vkontakte.ru') || s.includes('vk.com')) {
            return s
        } else if (s.includes('youtube.com')) {
            return 'https://www.youtube.com/embed/' + s.split('?v=')[1]
        } else if (s.includes('kiwi.kz/watch/')) {
            return 'https://v.kiwi.kz/v/' + s.split('kiwi.kz/watch/')[1].replace('/', '')
        } else if (s.includes('serve.kwcdn.kz')) {
            return 'https://v.kiwi.kz/v/' + s.substring(s.indexOf('.kz/mp4/') + 8, s.indexOf('/?secret') - 8)
        } else if (s.match(/data(\d)+\.video\.sibnet\.ru/)) {
            return 'https://video.sibnet.ru/shell.php?videoid=' + s.match(/\/(\d+)\.flv/)![1]
        }

        return s
    }

    async function * parsePage (url: string): AsyncIterable<Translation> {
        ctx.debug('loading %s', url)
        const html = await fetch(url)
            .then(i => i.buffer())
            .then(buf => iconv.decode(buf, 'win1251'))

        const $ = cheerio.load(html, {
            decodeEntities: false
        })

        $('legend:contains(рекомендуем)').parent().remove()
        if ($('.content-block').html()?.match(_3dTrash)) return
        if ($('#dle-content b:contains(Жанр)')[0]?.next.data?.match(/обзор/i)) return

        let m = url.match(/\.ru\/(.+?\/\d+)/)
        if (!m) {
            ctx.log('no id found for %s', url)
            return
        }

        const id = m[1]
        const lastSavedEpisode = await kv.get(`aspr-ls:${id}`, 0)

        const title = $('#dle-content .content-block-title').text().trim()
        const secondaryTitle = $('#dle-content td>b>h3').text().trim()

        let [seasonNameText, seasonYear] = $('b:contains("Сезон:")').next().text().split('-')
        let season: MediaSeason | null = null
        if (seasonNameText && seasonYear && seasonNameText in SEASONS && !isNaN(parseInt(seasonYear))) {
            season = {
                season: SEASONS[seasonNameText],
                year: parseInt(seasonYear)
            }
        }


        const target = await ctx.deps['common/lookup']({
            names: [secondaryTitle, title],
            startSeason: season
        })
        if (!target) {
            ctx.debug('lookup failed: %s %s', secondaryTitle, title)
            return
        }

        let subtitlesAuthor = ''
        {
            let el = $('b:contains(субтитров)')
            if (el.length) {
                let next = el.next()
                if (next.prop('tagName') === 'BR') {
                    next = $(el[0].next)
                }
                if (next) {
                    subtitlesAuthor = next.text()
                        .split(/[;,] /g)[0]
                        .replace(/ \(\d+\s*(?:-\s*\d+)?\s*эп\.?\)/i, '')
                        .trim()
                        .replace(/^[-:~_+=\-\[(<{]/, '')
                }
            }
        }

        const dubAuthors: Record<string, true> = {}

        {
            // find dubbers
            let el = $('b:contains(Озвучено)')
            if (el.length) {
                while (true) {
                    let next = el.next()
                    if (next.prop('tagName') === 'BR') {
                        next = $(el[0].next)
                    }
                    el = next
                    let tagName = el[0].type !== 'tag' ? 'SPAN' : el.prop('tagName')
                    if (!tagName.match(/^br?|span$/i)) break
                    if (tagName === 'BR') continue
                    if (tagName === 'B' || tagName === 'SPAN') {
                        let text = el.text().trim()
                        if (text === '') continue
                        if (text.match(/серии|ограничение|описание/i)) break
                        dubAuthors[text] = true
                    }
                }
            }
        }

        {
            // parse spoilers
            // (why on earth they decided it is client's job :thinking:)
            // code mostly copy-pasted from their page and adapted for cheerio
            // so it basically sucks.

            let openTags: number[] = []
            let tags: number[][] = []
            let faccordion = $($('.accordion').get(0))
            let hss = $('h3', faccordion)

            hss.each(function () {
                let cur = $(this)

                let id = (parseInt(cur.attr('id')!.replace('top_div_', '')) / 2) + 1
                if (cur.is(':contains([sss)')) {
                    if (cur.is(':contains([bgc=)')) {
                        let pos1 = cur.html()!.indexOf('[bgc=') + 5
                        let color = cur.html()!.slice(pos1, cur.html()!.indexOf(']', pos1))
                        cur.html(cur.html()!.replace('[bgc=' + color + ']', ''))
                    }
                    if (cur.is(':contains([sbgc=)')) {
                        let pos1 = cur.html()!.indexOf('[sbgc=') + 6
                        let color = cur.html()!.slice(pos1, cur.html()!.indexOf(']', pos1))
                        cur.html(cur.html()!.replace('[sbgc=' + color + ']', ''))
                    }

                    let pos1 = cur.html()!.indexOf('[sss=') + 5
                    let name = cur.html()!.slice(pos1, cur.html()!.indexOf(']', pos1))
                    cur.html(cur.html()!.replace('[sss=' + name + ']', ''))
                    openTags.push(id)
                    cur.before(`<h3 id="ss5" onclick="$('#spoiler_${id}').toggle();">${name}</h3><div id="spoiler_${id}"><center></center></div>`)
                }

                if (cur.is(':contains([/sss)') && openTags.length) {
                    let spoilerArray: number[] = []
                    spoilerArray.push(openTags[openTags.length - 1])
                    openTags.splice(openTags.indexOf(openTags[openTags.length - 1]), 1)
                    spoilerArray.push(id)
                    tags.push(spoilerArray)
                    cur.html(cur.html()!.replace('[/sss]', ''))
                }
            })

            for (let i = 0; i <= (tags.length - 1); i++) {
                let cur = $(`#top_div_${(tags[i][0] - 1) * 2}`)
                let spoiler = $(`#spoiler_${tags[i][0]} center`)
                while (true) {
                    if (cur.is('h3') && (((parseInt(cur.attr('id')!.replace('top_div_', '')) / 2) + 1) == tags[i][1])) {
                        spoiler.append(cur.clone())
                        spoiler.append(cur.next().clone())
                        spoiler.append(cur.next().next().clone())
                        cur.next().next().remove()
                        cur.next().remove()
                        cur.remove()
                        break
                    }
                    spoiler.append(cur.clone())
                    let next = cur.next()
                    cur.remove()
                    cur = next
                }

            }
        }

        const items = $('[onclick^=upAnime]').toArray()
        let maxEpisode = 0

        for (let it of items) {
            try {
                const el = $(it)

                let text = el.text().trim()
                if (!text || text.match(/трейлер|превью|сп[eеэ]шл/i)) continue

                let url: string | null = $(`#an_ul${el.attr('onclick')!.match(/upanime\((\d+)\)/i)![1]}`).text()
                if (url === '1') continue

                const path = el.parents('[id^=spoiler_]').toArray()
                    .map(i => $(`[onclick*="'#${$(i).attr('id')}'"]`).text())

                let episode = 1
                let author = ''
                let kind: TranslationKind = 'dub'

                let m = text.match(/^(\d+)(?:\.|\s)/)
                if (m) {
                    episode = parseInt(m[1])
                } else {
                    m = text.match(/\s*(\d+)\s*(?:https|$)/)
                    if (m) {
                        episode = parseInt(m[1])
                    }
                }

                if (episode <= lastSavedEpisode) continue
                if (episode > maxEpisode) {
                    maxEpisode = episode
                }

                if (path.length === 2) {
                    author = path[0]
                } else if (path.length === 1 || path.length === 0) {
                    let authorEl = el.find('>span').first()
                    if (authorEl.length) {
                        author = authorEl.text()
                    } else {
                        let match = text.match(/ \(.+?\)/)
                        if (match) {
                            author = match[0]
                        } else {
                            author = ''
                        }
                    }
                } else {
                    ctx.log('unexpected path length at %s: %d', url, path.length)
                    continue
                }

                author = author.trim()

                if (author.length && author[0].match(/[\[{(<+=~\-]/)) {
                    author = author.substr(1, author.length - 1)
                }

                if (author.length && author[author.length - 1].match(/[\]})>+=~\-]/)) {
                    author = author.substr(0, author.length - 1)
                }

                author = author.trim()

                if (author.match(/^(?:[pр][yу][cс]{2}ки[eе] )?[cс][уy]бтит[pр]ы$/i)) {
                    kind = 'sub'
                    author = subtitlesAuthor
                } else if (author.match(/^(?:[pр][yу][cс]{2}ки[eе] )?[cс][уy]бтит[pр]ы:?/i)) {
                    kind = 'sub'
                    author = author.match(/^(?:[pр][yу][cс]{2}ки[eе] )?[cс][уy]бтит[pр]ы:?(.*)/i)![1].trim()
                } else if (author.match(/^(?:[pр][yу][cс]{2}к(?:[aа]я|[oо][eе]) )?[oо]зв[yу]ч(?:к[aа]|ив[aа]ни[eе])$/i) || author === '') {
                    author = Object.keys(dubAuthors)[0] || ''
                } else if (author.match(/^(?:[pр][yу][cс]{2}к(?:[aа]я|[oо][eе]) )?[oо]зв[yу]ч(?:ен[oо]|к[aа]|ив[aа]ни[eе]):?/i)) {
                    author = author.match(/^(?:[pр][yу][cс]{2}к(?:[aа]я|[oо][eе]) )?озв[yу]ч(?:ен[oо]|к[aа]|ив[aа]ни[eе]):?(.*)/i)![1].trim()
                }

                if (author.match(/если кто знает/i)) author = ''
                author = author.replace(/присутствует назойливая реклама$/i, '')


                url = prepareUrl(url)

                if (url === null) continue

                yield {
                    target_type: 'anime',
                    target_id: target.id,
                    part: episode,
                    kind,
                    lang: 'ru',
                    author: ctx.deps['common/parse-author'](author.trim()),
                    url
                }
            } catch (e) {
                ctx.log('failed to process %s: %s', url, e)
            }
        }

        await kv.set(`aspr-ls:${id}`, maxEpisode)
    }

    const lastSaved = await kv.get('aspr-ls', '1970-01-01T00:00:00.000Z')
    let page = 1
    let backlog: AnimespiritMeta[] = []
    let backlogIndex: Record<string, true> = {}

    rootLoop:
        while (true) {
            const html = await fetch(`https://video.animespirit.ru/page/${page++}/`)
                .then(i => i.buffer())
                .then(i => iconv.decode(i, 'win1251'))

            const $ = cheerio.load(html, {
                decodeEntities: false
            })
            const items = $('.content-block').toArray()

            if (!items.length) break

            for (let it of items) {
                const el = $(it)

                if (el.html()?.match(_3dTrash)) continue
                let url = el.find('.content-block-title a').attr('href')
                if (!url) {
                    ctx.log('url not found')
                    return
                }
                let m = url.match(/\.ru\/(.+?\/\d+)/)
                if (!m) {
                    ctx.log('no id found for %s', url)
                    continue
                }

                const id = m[1]

                if (id in backlogIndex) continue

                const updatedAt = await fetch(url, {
                    method: 'HEAD'
                }).then(i => {
                    let date = new Date(i.headers.get('last-modified') || '')

                    if (isNaN(date as any)) {
                        return ''
                    }

                    return date.toISOString()
                })

                if (!updatedAt) {
                    ctx.log('no last-modified header at %s', url)
                    continue
                }

                if (updatedAt <= lastSaved) break rootLoop

                backlogIndex[id] = true
                backlog.push({
                    url,
                    updatedAt
                })
            }

            ctx.debug('loaded %d items', backlog.length)
        }

    backlogIndex = {}

    while (backlog.length) {
        let it = backlog.pop()
        if (!it) break

        yield * parsePage(it.url)
        ctx.stat()
        await kv.set('aspr-ls', it.updatedAt)
    }
}
