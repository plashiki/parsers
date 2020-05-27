import { describe, it } from 'mocha'
import { expect } from 'chai'
import { entry as fixMixedLangsEntry } from '../src/common/fix-mixed-langs'

describe('fix-mixed-langs', () => {
    const fixMixedLangs = fixMixedLangsEntry()

    it('should replace homoglyphs in russian', () => {
        expect(fixMixedLangs('Бaшня Бoga')).to.eq('Башня Бога')
        expect(fixMixedLangs('Bоruня блаroclovляет этот пpekpасный мup'))
            .to.eq('Богиня благословляет этот прекрасный мир')
        expect(fixMixedLangs('Cъешь eщё эtиx мягкиx fpaнцузских bуlok, да выпeй же чaю'))
            .to.eq('Съешь ещё этих мягких французских булок, да выпей же чаю')
        expect(fixMixedLangs('Шиpokaя элektpиfиkация южныx rуберний дact мoщный тoлчок поdъёму сеlьckоrо xозяйctvа'))
            .to.eq('Широкая электрификация южных губерний даст мощный толчок подъёму сельского хозяйства')
        expect(fixMixedLangs('V чащax юra жиl bы циtpyc? Дa, нo fаlьшивый экзemnляр!'))
            .to.eq('В чащах юга жил бы цитрус? Да, но фальшивый экземпляр!')
    })

    it('should replace homoglyphs in english', () => {
        expect(fixMixedLangs('Kаmi nо Тou')).to.eq('Kami no Tou')
        expect(fixMixedLangs('Копо Subaгаshii Sекai ni Shuкuфuки wo!'))
            .to.eq('Kono Subarashii Sekai ni Shukufuku wo!')
        expect(fixMixedLangs('Тhе quick brошn fох juмрs oвeг thе lazу доg'))
            .to.eq('The quick brown fox jumps over the lazy dog')
        expect(fixMixedLangs('The фiве bохing шiзагds juмр quiскlу'))
            .to.eq('The five boxing wizards jump quickly')
        expect(fixMixedLangs('Jаскдaшs лове mу big sphinх of quaгтз'))
            .to.eq('Jackdaws love my big sphinx of quartz')
    })

    it('should keep normal strings', () => {
        expect(fixMixedLangs('Kami no Tou')).to.eq('Kami no Tou')
        expect(fixMixedLangs('Съешь ещё этих мягких французских булок, да выпей же чаю'))
            .to.eq('Съешь ещё этих мягких французских булок, да выпей же чаю')
    })

    it('should keep other languages', () => {
        expect(fixMixedLangs('Zəfər, jaketini də, papağını da götür, bu axşam hava çox soyuq olacaq'))
            .to.eq('Zəfər, jaketini də, papağını da götür, bu axşam hava çox soyuq olacaq')
        expect(fixMixedLangs('いろはにほへと ちりぬるを わかよたれそ つねならむ うゐのおくやま けふこえて あさきゆめみし ゑひもせす'))
            .to.eq('いろはにほへと ちりぬるを わかよたれそ つねならむ うゐのおくやま けふこえて あさきゆめみし ゑひもせす')
        expect(fixMixedLangs('BanG Dream!（バンドリ！）第2期'))
            .to.eq('BanG Dream!（バンドリ！）第2期')
    })

    it('should keep special characters', () => {
        expect(fixMixedLangs('')).to.eq('')
        expect(fixMixedLangs('\n\t\0')).to.eq('\n\t\0')
        expect(fixMixedLangs('1234567890-=_+[]{}<>"\'/\\?!@#$%^&*(),.|`~'))
            .to.eq('1234567890-=_+[]{}<>"\'/\\?!@#$%^&*(),.|`~')
    })
})
