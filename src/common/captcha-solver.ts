import { ParserContext } from '../../types/ctx'

export interface CaptchaSolver {
    /**
     * Start solving a captcha for `params`
     * (see https://2captcha.com/2captcha-api)
     *
     * Returns captcha ID
     */
    startSolving (params: any): Promise<string>

    /**
     * Get captcha result by captcha ID or null if still solving
     *
     * @param id  Captcha ID
     */
    getResult (id: string): Promise<string | null>

    /**
     * Wait for captcha result.
     *
     * @param id  Captcha ID
     * @param delay  Delay between polls (default: 5s)
     * @param maxPolls  Maximum number of polls (default: Infinity)
     */
    waitForResult (id: string, delay?: number, maxPolls?: number): Promise<string>

    /**
     * Start solving a captcha for `params`
     * (see https://2captcha.com/2captcha-api)
     * and wait for result.
     *
     * Returns captcha result
     * @param params  Captcha params
     * @param delay  Delay between polls (default: 5s)
     * @param maxPolls  Maximum number of polls (default: Infinity)
     */
    startForResult (params: any, delay?: number, maxPolls?: number): Promise<string>
}

export function entry (ctx: ParserContext): CaptchaSolver {
    const { fetch, sleep, qs } = ctx.libs

    async function startSolving (params: any): Promise<string> {
        ctx.debug('Starting solving %s', params.method ?? '<unknown>')
        const [status, requestId] = await fetch(`${process.env.CAPTCHA_SERVICE}/in.php?${qs.stringify({
            key: process.env.CAPTCHA_TOKEN,
            ...params
        })}`).then(i => i.text()).then(i => i.split('|'))
        if (status !== 'OK') {
            throw new Error(`Captcha send error: ${status}`)
        }
        return requestId
    }

    async function getResult (id: string): Promise<string | null> {
        const [status, token] = await fetch(`${process.env.CAPTCHA_SERVICE}/res.php?${qs.stringify({
            key: process.env.CAPTCHA_TOKEN,
            action: 'get',
            id,
        })}`).then(i => i.text()).then(i => i.split('|'))

        if (status === 'CAPCHA_NOT_READY') {
            ctx.debug('Still solving')
            return null
        }
        if (status === 'OK') {
            ctx.debug('Captcha solved: %s', token)
            return token
        }

        throw Error(`Captcha get error: ${status}`)
    }

    async function waitForResult (id: string, delay = 5000, maxPolls = Infinity): Promise<string> {
        while ((maxPolls--) > 0) {
            const result = await getResult(id)
            if (result != null) return result

            await sleep(delay)
        }

        throw new Error('Captcha solver timeout')
    }

    async function startForResult (params: any, delay = 5000, maxPolls = Infinity): Promise<string> {
        const id = await startSolving(params)
        await sleep(delay)
        return waitForResult(id, delay, maxPolls)
    }

    return {
        startSolving,
        getResult,
        waitForResult,
        startForResult
    }
}