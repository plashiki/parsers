import { ParserContext } from '../../types/ctx'
import { Translation } from '../../types'

interface NarutoBaseMeta {
    url: string
    id: string
    title: string
}


export const provide = ['common/lookup']
export const storage = ['nb-ls%', 'nb-def']

export async function* entry (ctx: ParserContext): AsyncIterable<Translation> {
    const { kv, fetch, cheerio, objectUtils } = ctx.libs

    // older post mostly have dead players
    let lastSaved = await kv.get('nb-ls', '2016-01-01-0')
    let deferred = await kv.get<string[]>('nb-def', [])

    ctx.debug('lastSaved = %s, %d deferred', lastSaved, deferred.length)

    const map = {
        1: 'https://videofile.online/embed/$$/',
        2: 'https://protonvideo.to/iframe/$$/',
        3: 'https://myvi.ru/player/embed/html/$$',
        4: 'https://video.sibnet.ru/shell.php?videoid=$$',
        5: 'https://vk.com/video_ext.php?oid=$$',
        6: 'https://api.video.mail.ru/videos/embed/mail/$$.html',
        7: 'https://vio.to/video/serials/$$',
        8: 'https://www.wakanim.tv/ru/v2/catalogue/embeddedplayer/$$',
        9: 'https://ebd.cda.pl/620x395/$$?wersja=720p',
        10: 'https://www.aparat.com/video/video/embed/videohash/$$/vt/frame',
        15: 'https://rutube.ru/play/embed/$$',
        16: 'https://zedfilm.ru/embed/$$',
        18: 'https://video.meta.ua/iframe/$$/',
        20: 'https://streamguard.cc/$$',
        22: 'https://ok.ru/videoembed/$$',
        23: 'https://videoapi.my.mail.ru/videos/embed/inbox/$$.html',
        24: 'https://www.facebook.com/plugins/video.php?href=https://www.facebook.com/1457798235/videos/$$/&show_text=0&width=540&height=400',
        25: 'https://drive.google.com/file/d/$$/preview',
        26: 'https://my.mail.ru/video/embed/$$',
        27: 'https://vio.to/video/playlist/$$',
        28: 'https://www.getvi.tv/embed/$$/',
        29: 'https://vio.to/video/t/$$/',
        30: 'https://hlamer.ru/embed/$$',
        31: 'https://www.myvi.top/embed/$$',
        32: 'https://mega.nz/embed#!$$',
        34: 'https://www.ollhd.com/embed/$$',
        35: 'https://datalock.ru/player/$$',
        36: 'https://nb.svetacdn.in/$$',
        37: 'https://nb.synchroncode.com/embed/kp/$$',
        38: 'https://kodik.info/$$/720p?translations=false',
        39: 'https://start.u-stream.in/start/4b1e851c60c15f745d73669d36e42505/$$',
        40: 'https://lari.allohalive.com/$$',
        41: 'https://v1606847408.bazon.site/embed/$$',
    }

    function getUrl (js: string): string | null {
        let argsString = ''
        let nest = 0
        for (let c of js) {
            if (c === ')') nest -= 1
            if (nest >= 1) argsString += c
            if (c === '(') nest += 1
        }

        try {
            let args = JSON.parse('[' + argsString.replace(/'/g, '"') + ']')
            let [id, , type] = args
            if (!(
                type in map
            )) return null
            return map[type].replace('$$', id)
        } catch (e) {
            return null
        }
    }

    async function* parsePage (url: string, fromDeferred = false): AsyncIterable<Translation> {
        const html = await fetch(url).then(i => {
            if (i.status === 404) return '404'

            return i.text()
        })
        if (html === '404') return

        if (html.match(/серия ожидается/i)) {
            if (!fromDeferred) {
                ctx.debug('deferred: %s', url)
                deferred.push(url)
            }
            return
        }

        const $ = cheerio.load(html)
        const title = $('h1[itemprop="name"]').text()
        // ancient magic
        let m = title.match(/^(.+?)(?: -)? (\d+)(?: *\/ *(.+?) \2| \((.+?)\)| серия)?$/)
        if (!m || title.match(/манга|manga/i)) {
            ctx.log('did not match: %s', title)
            return
        }
        let part = parseInt(m[2])
        let names = [m[1], m[3] || m[4]]
        const target = await ctx.deps['common/lookup']({
            names,
        })
        if (!target) return

        let items = $('.ep1, .ep2').toArray()
        for (let el_ of items) {
            let el = $(el_)
            let src = getUrl(el.attr('onclick')!)
            if (!src) continue

            yield {
                target_id: target.id,
                target_type: 'anime',
                part,
                kind: el.text().match(/субтитр/) ? 'sub' : 'dub',
                lang: 'ru',
                author: { group: 'Naruto-Base' },
                url: src,
            }
        }
    }

    for (let url of deferred) {
        yield* parsePage(url, true)
    }

    let backlog: NarutoBaseMeta[] = []
    let backlogIndex: Record<number, true> = {}
    let page = 1

    rootLoop:
        while (true) {
            const pageUrl = `https://naruto-base.su/news/?page${page++}`
            const html = await fetch(pageUrl).then(i => {
                if (i.status === 404) return '404'

                return i.text()
            })
            if (html === '404') break

            const $ = cheerio.load(html)
            let items = $('.news.relative').toArray()

            for (let it of items) {
                let el = $(it)
                let a = el.find('.title a')

                let url = a.attr('href')
                if (!url) {
                    ctx.log('failed to find url')
                    continue
                }
                url = new URL(url, pageUrl).href
                let id = url.split('/').pop()!

                if (id <= lastSaved) {
                    break rootLoop
                }

                let title = a.text()
                if (!title.match(/^(.+?)(?: -)? (\d+)(?: *\/ *(.+?) \2| \((.+?)\)| серия)?$/) && !title.endsWith('…')
                    || title.match(/манга|manga/i)) {
                    // when ellipsized we can't tell if its crap until we load full page
                    ctx.debug('ignoring: %s', title)
                    continue
                }

                if (!(
                    id in backlogIndex
                )) {
                    backlogIndex[id] = true
                    backlog.push({
                        id,
                        url,
                        title,
                    })
                }
            }

            ctx.debug('loaded %d items', backlog.length)
        }

    while (backlog.length) {
        let it = backlog.pop()
        if (!it) break

        yield* parsePage(it.url)
        ctx.stat()
        await kv.set('nb-ls', it.id)
    }
    await kv.set('nb-def', objectUtils.uniqueBy(deferred))
}
