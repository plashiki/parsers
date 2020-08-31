/*
 * This module only declares types,
 * code is not in the repository.
 * To run parsers that use this module,
 * you'll have to write it on your own.
 */


import { Headers, RequestInfo, RequestInit } from 'node-fetch'

export interface CloudflareUamBypassFetchRequestInit extends RequestInit {
    // note: if you want to set additional cookies (apart from clearance) use 'cookie'
    // header, in lowercase

    /**
     * Whether to reset clearance cookie
     */
    reset?: string
}

/* Since bypass has to consume body to check if uam needed, it can't return original `Response` */
export interface CloudflareUamBypassFetchResponse {
    text: string
    json: any
    buffer: Buffer

    headers: Headers
    status: number
    statusText: string
}

export interface CloudflareUamBypass {
    /**
     * Bypass UAM for a given URL. After finishing, use `getCookieFor()`.
     * Returns URL containing __cf_chl_(jschl|captcha)_tk__ query parameter
     */
    bypass (url: string): Promise<string>

    /**
     * Get `Cookie and `User-Agent` header values that has UAM clearance for a given URL.
     */
    getHeadersFor (url: string): Promise<[string, string] | null>

    /**
     * fetch() wrapper that automatically sets clearance cookie header and user-agent and
     * runs bypass when challenge detected
     */
    fetch (
        url: RequestInfo,
        init?: CloudflareUamBypassFetchRequestInit
    ): Promise<CloudflareUamBypassFetchResponse>
}

/*
export function entry (ctx: ParserContext): CloudflareUamBypass {
    // ...
}
 */