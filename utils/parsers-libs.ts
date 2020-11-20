import * as cheerio from 'cheerio'
import fetch, { RequestInfo, RequestInit, Response } from 'node-fetch'
import * as objectUtils from './object-utils'
import FormData from 'form-data'
import * as iconv from 'iconv-lite'
import * as vm from 'vm'
import WebSocket from 'ws'
import * as qs from 'querystring'
import * as crypto from 'crypto'
import type JSDOM from 'jsdom'
import PB from 'protoflex'
import * as anitomy from '@teidesu/anitomy-js'
import * as fuzz from 'fuzzball'
import acorn from 'acorn'
import * as JSON5 from 'json5'
import KeyValue from './key-value'
import normalizeUrl from 'normalize-url'
import { DynamicOptions, ExternalServiceMappings, MediaPart, MediaType } from '../types'
import { RelationsParser } from '../engine/relations'
import { DEBUG } from './debug'
import { AbortController, AbortSignal } from 'abort-controller'
import puppeteer from 'puppeteer'
import { asyncPool } from './async-pool'

let httpAgent = undefined
if (process.env.FETCH_PROXY && process.env.FETCH_PROXY !== 'null') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    httpAgent = new (require('simple-proxy-agent'))(process.env.FETCH_PROXY)
}



export const libs = {
    cheerio,
    acorn,
    JSON5,
    fetch(
        url: RequestInfo,
        init?: RequestInit
    ): Promise<Response> {
        if (httpAgent) {
            if (!init) init = {}
            init.agent = httpAgent
        }

        return fetch(url, init)
    },
    vm,
    fuzz,
    objectUtils,
    FormData,
    iconv,
    WebSocket,
    qs,
    crypto,
    get JSDOM (): typeof JSDOM {
        // this boi is fat af
        return require('jsdom')
    },
    puppeteer,
    PB,
    anitomy,
    relations: RelationsParser.loadFromFile('relations.json'),
    mappings: {
        // stub
        async extend (type: MediaType, mapping: ExternalServiceMappings): Promise<void> {
            DEBUG.system('Mapping.extend (%s) %o', type, mapping)
        },
        async findFull (type: MediaType, mapping: ExternalServiceMappings): Promise<MediaType | null> {
            return null
        }
    },
    mediaParts: {
        // stub
        async add (part: MediaPart): Promise<void> {
            DEBUG.system('MediaParts.add %o', part)
        }
    },
    AbortController,
    AbortSignal,
    asyncPool,

    // when running locally there's a file-based stub,
    // so dont use typeorm api as it wont be available
    kv: new KeyValue('parsers.json'),

    // util functions
    sleep: (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms)),
    normalizeUrl (url: string, options?: normalizeUrl.Options) {
        // mix in some defaults
        return normalizeUrl(url, {
            defaultProtocol: 'https',
            forceHttps: true,
            normalizeProtocol: true,
            removeQueryParameters: [
                /^utm_\w+/i,
                'api_hash',
                '__ref',
                ...(options?.removeQueryParameters ?? [])
            ],
            // v better duplicate search
            sortQueryParameters: true,
            ...options
        })
    },
    async resolveDynamicOptions<T, I> (options: DynamicOptions<T, I>, item: I): Promise<Partial<T>> {
        let ret: Partial<T> = {}
        for (let key of Object.keys(options)) {
            let value = options[key]
            if (value instanceof Function) {
                ret[key] = await value(item)
            } else {
                ret[key] = value
            }
        }

        return ret
    }
}
