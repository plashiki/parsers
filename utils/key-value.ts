import * as fs from 'fs'
import { AnyKV } from '../types'
import { join } from 'path'

export default class KeyValue {
    data: AnyKV | null = null
    fileName: string

    constructor (fileName) {
        this.fileName = join(__dirname, '../', fileName)
    }

    async get<T> (key: string, fallback: T | null = null): Promise<T> {
        await this.__load()

        return this.data![key] ?? fallback
    }

    async getMany<T> (keys: string[], transformKey?: (k: string) => string): Promise<Record<string, T>> {
        await this.__load()

        let ret = {}
        keys.forEach((key) => {
            ret[transformKey ? transformKey(key) : key] = this.data![key]
        })
        return ret
    }

    set<T> (key: string, value: T): Promise<void> {
        this.data![key] = value
        return this.__save()
    }

    setMany (items: AnyKV): Promise<void> {
        for (let [k, v] of Object.entries(items)) {
            this.data![k] = v
        }
        return this.__save()
    }

    del (key: string): Promise<void> {
        delete this.data![key]
        return this.__save()
    }

    private async __save (): Promise<void> {
        if (!this.data) return
        let ret = {}
        Object.keys(this.data).forEach((key) => {
            ret[key] = JSON.stringify(this.data![key])
        })

        await fs.promises.writeFile(this.fileName, JSON.stringify(ret, Object.keys(ret).sort(), 4))
    }

    private async __load (): Promise<void> {
        if (this.data === null) {
            try {
                const text = await fs.promises.readFile(this.fileName)
                this.data = JSON.parse(text.toString('utf-8'))
                Object.keys(this.data!).forEach((key) => {
                    this.data![key] = JSON.parse(this.data![key])
                })
            } catch (e) {
                this.data = {}
                await this.__save()
            }
        }
    }

}
