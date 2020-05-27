import * as cheerio from 'cheerio'
import fetch from 'node-fetch'
import * as objectUtils from './object-utils'
import FormData from 'form-data'
import * as iconv from 'iconv-lite'
import WebSocket from 'ws'
import * as qs from 'querystring'
import * as crypto from 'crypto'
import type { JSDOM } from 'jsdom'
import PB from 'protoflex'
import * as anitomy from '@teidesu/anitomy-js'
import * as fuzz from 'fuzzball'
import KeyValue from './key-value'
import normalizeUrl from 'normalize-url'
import { DynamicOptions } from '../types'
import { RelationsParser } from '../engine/relations'


export const libs = {
    cheerio,
    fetch,
    fuzz,
    objectUtils,
    FormData,
    iconv,
    WebSocket,
    qs,
    crypto,
    get JSDOM (): JSDOM {
        // this boi is fat af
        return require('jsdom')
    },
    PB,
    anitomy,
    relations: RelationsParser.loadFromFile('relations.json'),

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
