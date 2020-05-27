export type StringKV = Record<string, string>
export type AnyKV = Record<string, any>
export type Constructor<T> = new (...args: any[]) => T
export type OptionalRecord<K extends keyof any, T> = {
    [P in K]?: T;
};

export type AtLeast<T, K extends keyof T> = Partial<T> & Pick<T, K>

export type TranslationLanguage =
    | 'en'
    | 'ru'
    | 'by'
    | 'ua'
    | 'jp'
    | 'fr'
    | 'de'
    | 'cn'
    | 'ko'
    | 'other'
export type TranslationKind = 'sub' | 'dub' | 'scan' | 'off' | 'raw'
export type MediaType = 'anime' | 'manga'

export interface Translation {
    target_id: number
    target_type: MediaType
    part: number

    kind: TranslationKind
    lang: TranslationLanguage
    hq: boolean
    author: string

    url: string
}

export interface MediaMeta {
    // case when id is known from meta-info, nothing special here

    /**
     * Target ID
     */
    id: number

    /**
     * Target type
     */
    type: MediaType

    /**
     * Target service ID. Default is MAL.
     * common/lookup always returns MAL id.
     */
    service?: string
}

export interface LookupOptions {
    /**
     * Known anime names, in order of priority.
     * Romaji name should go before translated (when available)
     * This way resolving will work better.
     */
    names: (string | undefined)[]

    /**
     * Default is Anime
     */
    mediaType?: MediaType

    /**
     * Preferred search services queue. Default order is:
     * Shikimori -> Anime365 -> Kitsu -> MAL -> Anilist
     * By choosing one of them, you put it
     * in the first place (use lowercase).
     * By providing an array, it will be used instead of default.
     *
     * Russian-first importers should use Shikimori or Anime365
     * English-first importers should use Kitsu
     */
    preferredSearch?: string | string[]
}

export type ImporterTarget = MediaMeta | LookupOptions

export type DynamicOptions<T, I> = {
    [key in keyof T]?: T[key] | ((item: I) => Promise<T[key]> | T[key])
}
export type ParserAdapter<T, V> = (item: T) => Promise<V[]>

export type ExternalService =
    | 'mal'          // MyAnimeList.net
    | 'anidb'        // AniDB.net
    | 'worldart'     // World-Art.ru
    | 'kitsu'        // Kitsu.io
    | 'anilist'      // AniList.co
    | 'ann'          // AnimeNewsNetwork.com
    | 'allcinema'    // AllCinema.net
    | 'fansubs'      // FanSubs.ru
    | 'crunchyroll'  // CrunchyRoll.net
    | 'kp'           // KinoPoisk.ru
    | 'mangaupdates' // MangaUpdates.com
    | 'thetvdb'      // TheTVDB.com
    | 'trakt'        // Trakt.TV
    | 'mydramalist'  // MyDramaList.com

export type ExternalServiceMappings = OptionalRecord<ExternalService, string>

export interface MapperResult {
    mappings: ExternalServiceMappings
    type: string // MediaType
}
