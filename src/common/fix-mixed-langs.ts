export function entry (): Function {
    const cyr = {
        'й': 1,
        'ц': 1,
        'у': 1,
        'к': 1,
        'е': 1,
        'н': 1,
        'г': 1,
        'ш': 1,
        'щ': 1,
        'з': 1,
        'х': 1,
        'ъ': 1,
        'ф': 1,
        'ы': 1,
        'в': 1,
        'а': 1,
        'п': 1,
        'р': 1,
        'о': 1,
        'л': 1,
        'д': 1,
        'ж': 1,
        'э': 1,
        'я': 1,
        'ч': 1,
        'с': 1,
        'м': 1,
        'и': 1,
        'т': 1,
        'ь': 1,
        'б': 1,
        'ю': 1
    }
    const lat = {
        'q': 1,
        'w': 1,
        'e': 1,
        'r': 1,
        't': 1,
        'y': 1,
        'u': 1,
        'i': 1,
        'o': 1,
        'p': 1,
        'a': 1,
        's': 1,
        'd': 1,
        'f': 1,
        'g': 1,
        'h': 1,
        'j': 1,
        'k': 1,
        'l': 1,
        'z': 1,
        'x': 1,
        'c': 1,
        'v': 1,
        'b': 1,
        'n': 1,
        'm': 1
    }
    const cyrlat = {
        'а': 'a',
        'б': 'b',
        'в': 'v',
        'г': 'r',
        'д': 'd',
        'е': 'e',
        'ж': 'z',
        'з': 'z',
        'и': 'u',
        'й': 'y',
        'к': 'k',
        'л': 'l',
        'м': 'm',
        'н': 'n',
        'о': 'o',
        'п': 'n',
        'р': 'p',
        'с': 'c',
        'т': 't',
        'у': 'y',
        'ф': 'f',
        'х': 'x',
        'ц': 'z',
        'ч': '4',
        'ш': 'w',
        'щ': 'w',
        'ы': 'i',
        'э': 'e',
        'ю': 'ю',
        'я': '9'
    }

    const latcyr = {
        'a': 'а',
        'b': 'б',
        'c': 'с',
        'd': 'д',
        'e': 'е',
        'f': 'ф',
        'g': 'г',
        'h': 'х',
        'i': 'и',
        'j': 'ж',
        'k': 'к',
        'l': 'л',
        'm': 'м',
        'n': 'п',
        'o': 'о',
        'p': 'р',
        'q': 'р',
        'r': 'г',
        's': 'с',
        't': 'т',
        'u': 'и',
        'v': 'в',
        'w': 'ш',
        'x': 'х',
        'y': 'у',
        'z': 'з'
    }

    return function (str: string): string {
        // fix memes with mixed ru/en keyboard layouts
        // Бaшня Бoga => Башня Бога
        // SovеtRоmantica => SovetRomantica (in first O & E are russian)
        let ru = 0
        let en = 0
        let other = 0
        for (let c of str) {
            c = c.toLowerCase()
            if (c in cyr) {
                ru++
            } else if (c in lat) {
                en++
            } else {
                other++
            }
        }

        // nothing to do here
        if (ru === 0 || en === 0) return str

        let ruPart = ru / str.length
        let enPart = en / str.length
        let otherPart = other / str.length

        if (otherPart > ruPart || otherPart > enPart) {
            // probably in some other language.
            return str
        }

        let map = ruPart > enPart
            // probably ru with lat symbols
            ? latcyr
            // probably lat with ru symbols
            : cyrlat

        let ret: string[] = []

        for (let c of str) {
            let lower = c.toLowerCase()
            let isUpper = lower !== c
            let n = map[lower] ?? c
            ret.push(isUpper ? n.toUpperCase() : n)
        }

        return ret.join('')
    }
}
