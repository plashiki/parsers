import { ParserContext } from '../../types/ctx'
import { Translation } from '../../types'

interface NarutoBaseMeta {
    url: string
    id: string
    title: string
}


export const provide = ['common/lookup']

export async function * entry (ctx: ParserContext): AsyncIterable<Translation> {
    // 2011-04-23-771 is the first post which had inline player and since then there was somewhat stable naming
    let lastSaved = await ctx.libs.kv.get('nb-ls', '2011-04-22-770')
    let deferred = await ctx.libs.kv.get<string[]>('nb-def', [])

    ctx.debug('lastSaved = %s, %d deferred', lastSaved, deferred.length)

    const map = {
        1: "https://videofile.online/embed/$$/",
        2: "https://videosafe.online/playlist_iframe/$$/",
        3: "https://myvi.ru/player/embed/html/$$",
        4: "https://video.sibnet.ru/shell.php?videoid=$$",
        5: "https://vk.com/video_ext.php?oid=$$",
        6: "http://api.video.mail.ru/videos/embed/mail/$$.html",
        7: "https://vio.to/video/serials/$$",
        8: "https://www.wakanim.tv/ru/v2/catalogue/embeddedplayer/$$",
        9: "https://ebd.cda.pl/620x395/$$?wersja=720p",
        10: "https://www.aparat.com/video/video/embed/videohash/$$/vt/frame",
        15: "https://rutube.ru/play/embed/$$",
        16: "https://zedfilm.ru/embed/$$",
        18: "https://video.meta.ua/iframe/$$/",
        20: "https://streamguard.cc/$$",
        22: "https://ok.ru/videoembed/$$",
        23: "https://videoapi.my.mail.ru/videos/embed/inbox/$$.html",
        24: "https://www.facebook.com/plugins/video.php?href=https://www.facebook.com/1457798235/videos/$$/&show_text=0&width=540&height=400",
        25: "https://drive.google.com/file/d/$$/preview",
        26: "https://my.mail.ru/video/embed/$$",
        27: "https://vio.to/video/playlist/$$",
        28: "https://www.getvi.tv/embed/$$/",
        29: "https://vio.to/video/t/$$/",
        30: "https://hlamer.ru/embed/$$",
        31: "https://www.myvi.top/embed/$$",
        32: "https://mega.nz/embed#!$$",
        34: "https://www.ollhd.com/embed/$$",
        35: "https://datalock.ru/player/$$",
        36: "https://nb.videocdn.pw/$$",
        37: "https://nb.delivembed.cc/embed/kp/$$",
        38: "https://kodik.info/$$/720p?translations=false",
        39: "https://start.u-cdn.top/start/4b1e851c60c15f745d73669d36e42505/$$",
        40: "https://lari.allohalive.com/$$",
    }

    function getUrl (js: string): string | null {
        let argsString = ''
        let nest = 0
        for (let c of js) {
            if (c === ')') nest -= 1
            if (nest >= 1) argsString += c
            if (c === '(') nest += 1
        }

        let args = JSON.parse('[' + argsString.replace(/'/g, '"') + ']')
        let [id, , type] = args
        if (!(type in map)) return null
        return map[type].replace('$$', id)
    }

    async function * parsePage (url: string, fromDeferred = false): AsyncIterable<Translation> {
        const html = await ctx.libs.fetch(url).then(i => {
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

        const $ = ctx.libs.cheerio.load(html)
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
            preferredSearch: 'anime365'
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
                hq: !src.match(/sibnet|myvi|rutube/),
                author: 'Naruto-Base',
                url: src
            }
        }
    }

    for (let url of deferred) {
        yield * parsePage(url, true)
    }

    let backlog: NarutoBaseMeta[] = []
    let backlogIndex: Record<number, true> = {}
    let page = 1

    rootLoop:
        while (true) {
            const html = await ctx.libs.fetch(`https://naruto-base.su/news/?page${page++}`).then(i => {
                if (i.status === 404) return '404'

                return i.text()
            })
            if (html === '404') break

            const $ = ctx.libs.cheerio.load(html)
            let items = $('.news.relative').toArray()

            for (let it of items) {
                let el = $(it)
                let a = el.find('.title a')

                let url = a.attr('href')
                if (!url) {
                    ctx.log('failed to find url')
                    continue
                }
                if (url.startsWith('//')) url = 'https:' + url
                if (url[0] === '/') url = 'https://naruto-base.su' + url
                let id = url.split('/').pop()!

                if (id <= lastSaved) {
                    break rootLoop
                }

                let title = a.text()
                if (!title.match(/^(.+?)(?: -)? (\d+)(?: *\/ *(.+?) \2| \((.+?)\)| серия)?$/) && !title.endsWith('…') || title.match(/манга|manga/i)) {
                    // when ellipsized we can't tell if its crap until we load full page
                    ctx.debug('ignoring: %s', title)
                    continue
                }

                if (!(id in backlogIndex)) {
                    backlogIndex[id] = true
                    backlog.push({
                        id,
                        url,
                        title
                    })
                }
            }

            ctx.debug('loaded %d items', backlog.length)
        }

    while (backlog.length) {
        let it = backlog.pop()
        if (!it) break

        yield * parsePage(it.url)
        ctx.stat()
        await ctx.libs.kv.set('nb-ls', it.id)
    }
    await ctx.libs.kv.set('nb-def', ctx.libs.objectUtils.uniqueBy(deferred))
}
