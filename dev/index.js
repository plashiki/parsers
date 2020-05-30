const events = require('events')
const express = require('express')
const ws = require('ws')
const path = require('path')
const fs = require('fs')
const cp = require('child_process')
const _debug = require('debug')
const anitomy = require('@teidesu/anitomy-js')
const fetch = require('node-fetch')
const iconv = require('iconv-lite')
const cheerio = require('cheerio')
const dotenv = require('dotenv')
const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env')).toString('utf-8'))

const PORT = process.env.PORT || 6217
_debug.enable('parsers:*')
const debug = _debug('parsers:devtools')
const ioBus = new events.EventEmitter()

function patchIo (stream, stderr) {
    stream.write = function (buffer, cb) {
        ioBus.emit('print', {
            str: (stderr ? '\u001b[31m' : '') + (typeof buffer === 'string' ? buffer : buffer.toString()) + (stderr
                ? '\u001b[0m'
                : ''),
        })
        if (cb) cb(null)
    }
}

function patchChildIo (proc) {
    proc.stdout.on('data', (data) => {
        ioBus.emit('print', {
            str: typeof data === 'string' ? data : data.toString(),
        })
    })
    proc.stderr.on('data', (data) => {
        ioBus.emit('print', {
            str: '\u001b[31m' + (typeof data === 'string' ? data : data.toString()) + '\u001b[0m',
        })
    })
}

patchIo(process.stderr, true)
patchIo(process.stdout)

const app = express()
app.use(express.static(path.join(__dirname, 'static')))

const wss = new ws.Server({
    noServer: true,
})

let compiling = false
let running = false

app.get('/ws', (req, res) => {
    if (!req.headers.upgrade || req.headers.upgrade.indexOf('websocket') === -1) {
        return res.send('no upgrade header')
    }

    wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => {
        const rpc = function (name, params = {}) {
            ws.send(JSON.stringify({
                act: name,
                params,
            }))
        }

        const logSender = ({ str }) => {
            rpc('log', {
                str,
            })
        }

        ioBus.on('print', logSender)

        ws.onmessage = (evt) => {
            let json
            try {
                json = JSON.parse(evt.data)
            } catch (e) {
                return
            }

            if (!json.act) return

            if (json.act === 'compile' && !compiling) {
                debug('Compiling...')
                compiling = cp.exec('npm run build', {
                    cwd: path.join(__dirname, '..'),
                    detached: true,
                }, (err) => {
                    compiling = false
                    if (err) {
                        debug('Error: %s', err.signal || err.code)
                    } else {
                        debug('Compiled!')
                    }
                })
                patchChildIo(compiling)
            }

            if (json.act === 'run' && !running) {
                debug('Running %s', json.params.name)
                running = cp.exec('node dist/engine/index.js', {
                    detached: true,
                    cwd: path.join(__dirname, '..'),
                    env: {
                        DEBUGGING: json.params.name,
                    },
                }, (err) => {
                    running = false
                    rpc('finished')
                    if (err) {
                        debug('Error: %s', err.signal || err.code)
                    } else {
                        debug('Process finished.')
                    }
                })
                patchChildIo(running)
            }

            if (json.act === 'stop' && running) {
                running.kill()
                running = false
                rpc('finished')
            }

            if (json.act === 'create') {
                const filename = json.params.name + '.ts'
                const fullpath = path.join(__dirname, '../src', filename)
                fs.promises.stat(fullpath).then(() => {
                    debug('%s already exists', json.params.name)
                }).catch((e) => {
                    if (e.code === 'ENOENT') {
                        debug('Creating new parser %s', json.params.name)
                        const segments = json.params.name.split('/')
                        fs.promises.mkdir(path.dirname(fullpath), {
                            recursive: true,
                        }).then(() => {

                            let s = `import { ParserContext } from '${path.relative(
                                path.dirname(fullpath),
                                path.join(__dirname, '../types/ctx'),
                            )}'\n\nexport const provide = [`
                            if (segments[0] === 'importers' && segments.length > 2) {
                                s += '\'services/' + segments[1] + '\''
                            }
                            s += ']\n\nexport function entry (ctx: ParserContext) {\n    '
                            if (segments[0] === 'importers' && segments.length > 2) {
                                s += 'return ctx.deps[\'services/' + segments[1] + '\']({\n        \n    })'
                            }
                            s += '\n}'
                            return fs.promises.writeFile(fullpath, s)
                        }).then(() => {
                            debug('%s created!', json.params.name)
                        }).catch(console.error)
                    } else {
                        debug('Error: %s', e.stack)
                    }
                })
            }

            if (json.act === 'action') {
                const { name, text } = json.params
                if (name === 'anitomy') {
                    anitomy.parse(text).then((result) => {
                        debug('Anitomy result for "%s":', text)
                        console.log(JSON.stringify(result, null, 2))
                    })
                } else if (name === 'names') {
                    let m = text.match(/^(?:https:\/\/)?vk\.com\/videos(-?\d+)/)
                    if (m) {
                        const [, owner] = m
                        m = text.match(/page=(\d+)/)
                        let page = m ? m[1] : 1
                        m = text.match(/count=(\d+)/)
                        let count = Math.min(200, m ? parseInt(m[1]) : 50)

                        return fetch(`https://api.vk.com/method/video.get?access_token=${env.VK_TOKEN}&v=5.101&`
                            + `owner_id=${owner}&count=${count}&offset=${(page - 1) * count}`,
                        ).then(i => i.json()).then((it) => {
                            if (it.error) {
                                debug('Error fetching VK videos:')
                                console.error(JSON.stringify(it.error, null, 4))
                            } else {
                                debug('%s video names:', owner)
                                console.log(it.response.items.map(it => it.title).join('\n'))
                            }
                        }).catch(console.error)
                    }

                    m = text.match(/^(?:https:\/\/)?video\.sibnet\.ru\/users\/(.+?)(?:[\/?#]|$)/im)
                    if (m) {
                        const [, owner] = m
                        m = text.match(/page=(\d+)/)
                        let page = m ? m[1] : 1
                        return fetch(`https://video.sibnet.ru/users/${encodeURIComponent(owner)}/video/?sort=0&page=${page}`)
                            .then(i => {
                                if (i.status !== 200) debug('http %d', i.status)

                                return i.buffer()
                            })
                            .then((buf) => {
                                const html = iconv.decode(buf, 'win1251')
                                const $ = cheerio.load(html)
                                debug('%s video names:', owner)
                                console.log($('.video_cell>.preview>a').toArray().map((it) => {
                                    let titleParts = it.attribs.title.split(' - ')
                                    titleParts.pop()
                                    return titleParts.join(' - ')
                                }).join('\n'))
                            })
                    }

                    m = text.match(/^(?:https:\/\/)?(?:www\.)?myvi\.(?:top|tv|xyz)\/(.+?)(?:[\/?#]|$)/im)
                    if (m) {
                        const [, owner] = m
                        m = text.match(/count=(\d+)/)
                        let count = Math.min(200, m ? parseInt(m[1]) : 50)
                        return fetch(`https://api.myvi.tv/api/1.0/videos/${owner}/channel?host=www.myvi.tv&size=${count}&sort=desc`)
                            .then(i => {
                                if (i.status !== 200) debug('http %d', i.status)

                                return i.json()
                            })
                            .then((json) => {
                                debug('%s video names:', owner)
                                console.log(json.elements.map(it => it.title).join('\n'))
                            })
                    }
                    debug('Unknown URL')
                }
            }
        }

        ws.onclose = () => {
            ioBus.off('print', logSender)
        }
    })
})

app.listen(PORT, () => {
    console.log('DevTools are running on port %d', PORT)
})
