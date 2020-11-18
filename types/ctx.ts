import { AnyKV, LookupOptions, MediaMeta, ParserAdapter, Translation, TranslationAuthor } from './index'
import { Debugger } from 'debug'
import { libs } from '../utils/parsers-libs'
import { VkImporterOptions } from '../src/services/vk-video'
import { RegexAdapterOptions } from '../src/common/regex-adapter'
import { AnitomyAdapterOptions } from '../src/common/anitomy-adapter'
import { IncrementalGrabOptions } from '../src/common/incremental-grab'
import { SibnetImporterOptions } from '../src/services/sibnet'
import { MyviImporterOptions } from '../src/services/myvi'
import { CaptchaSolver } from '../src/common/captcha-solver'
import { CloudflareUamBypass } from '../src/common/.cf-uam-bypass'
import { LookupInterface } from '../src/common/lookup'

export interface ParserContext<P = AnyKV> {
    /**
     * Current environment
     */
    env: 'local' | 'server'

    /**
     * UID of a parser.
     */
    uid: string

    /**
     * UID of a root parser (i.e. which is currently actually running)
     * When not equal to `uid` then parser was imported by `rootUid`
     */
    rootUid: string

    /**
     * Parser's runtime parameters.
     */
    params: P

    /**
     * Server's config.ts. Can be useful...sometimes.
     * Not available when running locally, be careful!
     *
     * Better use .env file and `process.env` for deploy-time constants
     */
    config?: AnyKV

    /**
     * Parser's dependencies. Key is provided parser's UID, value is their return value
     */
    deps: {
        'common/regex-adapter'<T> (optionsArray: RegexAdapterOptions<T>[]): ParserAdapter<T, Translation>
        'common/compose'<T, R> (adapters: ParserAdapter<T, R>[]): ParserAdapter<T, R>
        'common/anitomy-adapter'<T> (options: AnitomyAdapterOptions<T>): ParserAdapter<T, Translation>
        'common/fix-mixed-langs' (str: string): string
        'common/incremental-grab'<T> (options: IncrementalGrabOptions<T>): AsyncIterable<T>
        'common/mapper-url2meta' (url: string): Promise<MediaMeta | null>
        'common/parse-author' (author: string): TranslationAuthor
        'services/vk-video'<T> (options: VkImporterOptions<T>): AsyncIterable<T>
        'services/sibnet'<T> (options: SibnetImporterOptions<T>): AsyncIterable<T>
        'services/myvi'<T> (options: MyviImporterOptions<T>): AsyncIterable<T>

        'common/lookup': LookupInterface
        'common/captcha-solver': CaptchaSolver
        'common/cf-uam-bypass': CloudflareUamBypass

        // any other that were not covered before
        [key: string]: any
    }

    /**
     * Parser's own logging facility.
     * In server environment, `debug` is replaced with a no-op.
     * When running locally, they are equal.
     * In server environment, they use parser's rootUid
     * When running locally, all parsers use own uid.
     *
     * Lines only containing `ctx.debug(...)` will be removed when deploying
     */
    log: Debugger
    debug: Debugger

    /**
     * A bunch of libraries that may be useful.
     */
    libs: typeof libs,

    /**
     * For parsers designed to be run externally:
     * indicate that return value should not be enclosed in JSON envelope
     */
    raw?: true

    /**
     * For parsers designed to be run externally:
     * headers for http response
     */
    headers?: Record<string, string>




    /**
     * Statistics: to be called each time an item was processed
     * (from source).
     * Example: a single VK video was processed and yielded, then stat(1)
     * Used to calculate importer efficiency.
     *
     * Local run only: call as stat(-1) to receive information and reset counter
     * On server stat() always returns void
     *
     * @param n
     */
    stat (n?: number): void | number

    __stat: number
}


export type CleanerContext = ParserContext<{
    // no type here sry :c
    // extends TypeORM BaseEntity bascially.
    Translation: any
}>
