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

export interface ExternalId {
    service: ExternalService
    id: string | number
}

export interface TranslationAuthor {
    group?: string
    people?: string[] | string
    ripper?: string
}

export interface Translation {
    target_id: number | ExternalId
    target_type: MediaType
    part: number

    kind: TranslationKind
    lang: TranslationLanguage
    author: TranslationAuthor

    url: string
}

export interface Mapping {
    id: number
    type: MediaType
    external: ExternalServiceMappings
}

export interface MediaMeta {
    id: ExternalId
    type: MediaType
}

export interface MediaSeason {
    year: number
    season: 'winter' | 'spring' | 'summer' | 'fall' | 'any'
}

export interface LookupOptions {
    /**
     * Known anime names, in order of priority.
     * Romaji name should go before translated (when available)
     * This way resolving will work better.
     */
    names: (string | undefined)[]

    /**
     * If known, media start season
     * If passed, will only use items that have the same start season
     */
    startSeason?: MediaSeason | null

    /**
     * If known, media end season
     * If passed, will only use items that have the same end season
     */
    endSeason?: MediaSeason | null

    /**
     * If known, media start or end season
     * If passed, will only use items that have the same season, either start or end
     */
    someSeason?: MediaSeason | null

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
    | 'imdb'         // IMDb.com
    | 'mangaupdates' // MangaUpdates.com
    | 'thetvdb'      // TheTVDB.com
    | 'trakt'        // Trakt.TV
    | 'mydramalist'  // MyDramaList.com
    | 'anime365'     // anime365.ru

export type ExternalServiceMappings = OptionalRecord<ExternalService, string>

export interface MapperResult {
    mappings: ExternalServiceMappings
    type: string // MediaType
}

export interface PlayerPayload {
    video: PlayerSource | PlayerSource[]
    subtitles?: {
        src: string
        options?: AnyKV
        srcType?: 'url' | 'text'
    }
}

export interface PlayerSource {
    height?: number
    name?: string
    type?: string            // MIME type of video. Used to determine player.
                             // If none is passed then 'video/mp4' is implied
    src?: string             // Single url to video. Alias for `urls: <src>`
    urls?: string | string[] // Url to video or array of urls.
                             // If array is passed then videos will be
                             // concatenated. Has higher priority than `src`
}

export interface MediaPart {
    // id: number // not needed for addition
    media_type: MediaType
    media_id: number
    number: number
    title: string
}
