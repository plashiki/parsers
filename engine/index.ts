import { DEBUG } from '../utils/debug'
import { executeParser, runCleaner, runImporter, runMapper } from './runner'

DEBUG.system('early init')

const debugging = process.env.DEBUGGING

if (!debugging) {
    DEBUG.system('nothing to run, plz set parser name in .env')
} else {
    DEBUG.system('lets go')

    try {
        if (debugging.startsWith('importers/')) {
            runImporter(debugging).catch(DEBUG.system)
        } else if (debugging.startsWith('mappers/')) {
            runMapper(debugging).catch(DEBUG.system)
        } else if (debugging.startsWith('cleaners/')) {
            runCleaner(debugging).catch(DEBUG.system)
        } else {
            executeParser(debugging).then(DEBUG.system)
        }

    } catch (e) {
        DEBUG.system(e)
    }
}
