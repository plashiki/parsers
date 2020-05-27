import { ParserContext } from '../../types/ctx'

export const cri = true
export const disabled = true


export async function entry (ctx: ParserContext) {
    let i = 0
    ctx.log('this is a test cri parser')
    ctx.log('starting endless cycle of misery')
    setInterval(() => {
        ctx.log('%dms since start', (++i) * 1000)
    }, 1000)
}
