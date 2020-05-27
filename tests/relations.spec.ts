import { describe, it } from 'mocha'
import { expect } from 'chai'
import { RelationsParser } from '../engine/relations'

const rule = s => '::rules\n' + s
const parse = s => {
    const parser = new RelationsParser()
    parser.loadRaw(rule(s))
    return parser
}

describe('relations', () => {
    it('should ignore comments', () => {
        const d = parse('# 1|1|1:1 -> 2|2|2:2')
        expect(d.findRelation(1, 'mal', 1)).to.eq(null)
        expect(d.findRelation(1, 'mal', 2)).to.eq(null)
        expect(d.findRelation(2, 'mal', 1)).to.eq(null)
    })

    it('should handle single-to-single relations', () => {
        const d = parse('- 1|1|1:1 -> 2|2|2:2')
        expect(d.findRelation(1, 'mal', 1)).to.eql({
            id: {
                mal: '2',
                kitsu: '2',
                anilist: '2'
            },
            n: 2
        })
        expect(d.findRelation(1, 'mal', 2)).to.eq(null)
        expect(d.findRelation(2, 'mal', 1)).to.eq(null)
    })

    it('should handle range-to-single relations', () => {
        const d = parse('- 1|1|1:1-3 -> 2|2|2:2')

        const expectation = {
            id: {
                mal: '2',
                kitsu: '2',
                anilist: '2'
            },
            n: 2
        }

        expect(d.findRelation(1, 'mal', 1)).to.eql(expectation)
        expect(d.findRelation(1, 'mal', 2)).to.eql(expectation)
        expect(d.findRelation(1, 'mal', 3)).to.eql(expectation)
        expect(d.findRelation(1, 'mal', 4)).to.eq(null)
        expect(d.findRelation(1, 'mal', 666)).to.eq(null)
        expect(d.findRelation(1, 'mal', 0)).to.eq(null)
        expect(d.findRelation(2, 'mal', 1)).to.eq(null)
    })

    it('should handle range-to-range relations', () => {
        const d = parse('- 1|1|1:1-3 -> 2|2|2:2-4')

        const expectation = i => ({
            id: {
                mal: '2',
                kitsu: '2',
                anilist: '2'
            },
            n: i
        })

        expect(d.findRelation(1, 'mal', 1)).to.eql(expectation(2))
        expect(d.findRelation(1, 'mal', 2)).to.eql(expectation(3))
        expect(d.findRelation(1, 'mal', 3)).to.eql(expectation(4))
        expect(d.findRelation(1, 'mal', 4)).to.eq(null)
        expect(d.findRelation(1, 'mal', 666)).to.eq(null)
        expect(d.findRelation(1, 'mal', 0)).to.eq(null)
        expect(d.findRelation(2, 'mal', 1)).to.eq(null)
    })

    it('should handle variable-range-to-single relations', () => {
        const d = parse('- 1|1|1:2-? -> 2|2|2:1')

        const expectation = {
            id: {
                mal: '2',
                kitsu: '2',
                anilist: '2'
            },
            n: 1
        }

        expect(d.findRelation(1, 'mal', 1)).to.eq(null)
        expect(d.findRelation(1, 'mal', 2)).to.eql(expectation)
        expect(d.findRelation(1, 'mal', 3)).to.eql(expectation)
        expect(d.findRelation(1, 'mal', 4)).to.eql(expectation)
        expect(d.findRelation(1, 'mal', 5)).to.eql(expectation)
        expect(d.findRelation(1, 'mal', 666)).to.eql(expectation)
        expect(d.findRelation(1, 'mal', 0)).to.eq(null)
        expect(d.findRelation(2, 'mal', 1)).to.eq(null)
    })

    it('should handle variable-range-to-variable-range relations', () => {
        const d = parse('- 1|1|1:2-? -> 2|2|2:1-?')

        const expectation = i => ({
            id: {
                mal: '2',
                kitsu: '2',
                anilist: '2'
            },
            n: i
        })

        expect(d.findRelation(1, 'mal', 1)).to.eq(null)
        expect(d.findRelation(1, 'mal', 2)).to.eql(expectation(1))
        expect(d.findRelation(1, 'mal', 3)).to.eql(expectation(2))
        expect(d.findRelation(1, 'mal', 4)).to.eql(expectation(3))
        expect(d.findRelation(1, 'mal', 5)).to.eql(expectation(4))
        expect(d.findRelation(1, 'mal', 666)).to.eql(expectation(665))
        expect(d.findRelation(1, 'mal', 0)).to.eq(null)
        expect(d.findRelation(2, 'mal', 1)).to.eq(null)
    })

    it('should handle self references', () => {
        const d = parse('- 1|1|1:102-? -> 2|2|2:1-?!')

        const expectation = i => ({
            id: {
                mal: '2',
                kitsu: '2',
                anilist: '2'
            },
            n: i
        })

        expect(d.findRelation(1, 'mal', 101)).to.eq(null)
        expect(d.findRelation(1, 'mal', 102)).to.eql(expectation(1))
        expect(d.findRelation(1, 'mal', 103)).to.eql(expectation(2))
        expect(d.findRelation(1, 'mal', 104)).to.eql(expectation(3))
        expect(d.findRelation(1, 'mal', 105)).to.eql(expectation(4))
        expect(d.findRelation(1, 'mal', 666)).to.eql(expectation(565))
        expect(d.findRelation(2, 'mal', 101)).to.eq(null)
        expect(d.findRelation(2, 'mal', 102)).to.eql(expectation(1))
        expect(d.findRelation(2, 'mal', 103)).to.eql(expectation(2))
        expect(d.findRelation(2, 'mal', 104)).to.eql(expectation(3))
        expect(d.findRelation(2, 'mal', 105)).to.eql(expectation(4))
        expect(d.findRelation(2, 'mal', 666)).to.eql(expectation(565))
        expect(d.findRelation(1, 'mal', 0)).to.eq(null)
        expect(d.findRelation(2, 'mal', 1)).to.eq(null)
    })

    it('should handle id backref', () => {
        const d = parse('- 1|1|1:102-? -> ~|~|~:1-?')

        const expectation = i => ({
            id: {
                mal: '1',
                kitsu: '1',
                anilist: '1'
            },
            n: i
        })

        expect(d.findRelation(1, 'mal', 101)).to.eq(null)
        expect(d.findRelation(1, 'mal', 102)).to.eql(expectation(1))
        expect(d.findRelation(1, 'mal', 103)).to.eql(expectation(2))
        expect(d.findRelation(1, 'mal', 104)).to.eql(expectation(3))
        expect(d.findRelation(1, 'mal', 105)).to.eql(expectation(4))
        expect(d.findRelation(1, 'mal', 666)).to.eql(expectation(565))
        expect(d.findRelation(1, 'mal', 0)).to.eq(null)
        expect(d.findRelation(2, 'mal', 1)).to.eq(null)
    })

    it('should handle unknown ids', () => {
        const d = parse('- 1|?|?:102-? -> ~|~|~:1-?')

        const expectation = i => ({
            id: {
                mal: '1',
                kitsu: null,
                anilist: null
            },
            n: i
        })

        expect(d.findRelation(1, 'mal', 101)).to.eq(null)
        expect(d.findRelation(1, 'mal', 102)).to.eql(expectation(1))
        expect(d.findRelation(1, 'mal', 103)).to.eql(expectation(2))
        expect(d.findRelation(1, 'mal', 104)).to.eql(expectation(3))
        expect(d.findRelation(1, 'mal', 105)).to.eql(expectation(4))
        expect(d.findRelation(1, 'mal', 666)).to.eql(expectation(565))
        expect(d.findRelation(1, 'mal', 0)).to.eq(null)
        expect(d.findRelation(2, 'mal', 1)).to.eq(null)
    })

    it('should handle multiple single-to-single relations', () => {
        const d = parse('- 1|1|1:1 -> 2|2|2:2\n- 1|1|1:2 -> 2|2|2:3')

        const expectation = i => ({
            id: {
                mal: '2',
                kitsu: '2',
                anilist: '2'
            },
            n: i
        })

        expect(d.findRelation(1, 'mal', 1)).to.eql(expectation(2))
        expect(d.findRelation(1, 'mal', 2)).to.eql(expectation(3))
        expect(d.findRelation(1, 'mal', 3)).to.eq(null)
        expect(d.findRelation(1, 'mal', 0)).to.eq(null)
        expect(d.findRelation(2, 'mal', 1)).to.eq(null)
    })

    it('should handle multiple range-to-range relations', () => {
        const d = parse('- 1|1|1:1-3 -> 2|2|2:2-5\n- 1|1|1:6-8 -> 2|2|2:8-10')

        const expectation = i => ({
            id: {
                mal: '2',
                kitsu: '2',
                anilist: '2'
            },
            n: i
        })

        expect(d.findRelation(1, 'mal', 1)).to.eql(expectation(2))
        expect(d.findRelation(1, 'mal', 2)).to.eql(expectation(3))
        expect(d.findRelation(1, 'mal', 3)).to.eql(expectation(4))
        expect(d.findRelation(1, 'mal', 4)).to.eq(null)
        expect(d.findRelation(1, 'mal', 5)).to.eq(null)
        expect(d.findRelation(1, 'mal', 6)).to.eql(expectation(8))
        expect(d.findRelation(1, 'mal', 7)).to.eql(expectation(9))
        expect(d.findRelation(1, 'mal', 8)).to.eql(expectation(10))
        expect(d.findRelation(1, 'mal', 0)).to.eq(null)
        expect(d.findRelation(2, 'mal', 1)).to.eq(null)
    })

    it('should handle overlapping range-to-range relations', () => {
        const d = parse('- 1|1|1:1-3 -> 2|2|2:2-5\n- 1|1|1:2-4 -> 2|2|2:8-10')

        const expectation = i => ({
            id: {
                mal: '2',
                kitsu: '2',
                anilist: '2'
            },
            n: i
        })

        expect(d.findRelation(1, 'mal', 1)).to.eql(expectation(2))
        expect(d.findRelation(1, 'mal', 2)).to.eql(expectation(8))
        expect(d.findRelation(1, 'mal', 3)).to.eql(expectation(9))
        expect(d.findRelation(1, 'mal', 4)).to.eql(expectation(10))
        expect(d.findRelation(1, 'mal', 5)).to.eq(null)
        expect(d.findRelation(1, 'mal', 6)).to.eq(null)
        expect(d.findRelation(1, 'mal', 0)).to.eq(null)
        expect(d.findRelation(2, 'mal', 1)).to.eq(null)
    })

    it('should only honor last variable range relation', () => {
        const d = parse('- 1|1|1:2-? -> 2|2|2:2\n- 1|1|1:6-? -> 2|2|2:3')

        const expectation = i => ({
            id: {
                mal: '2',
                kitsu: '2',
                anilist: '2'
            },
            n: i
        })

        expect(d.findRelation(1, 'mal', 1)).to.eq(null)
        expect(d.findRelation(1, 'mal', 2)).to.eql(null)
        expect(d.findRelation(1, 'mal', 3)).to.eql(null)
        expect(d.findRelation(1, 'mal', 4)).to.eq(null)
        expect(d.findRelation(1, 'mal', 5)).to.eq(null)
        expect(d.findRelation(1, 'mal', 6)).to.eql(expectation(3))
        expect(d.findRelation(1, 'mal', 7)).to.eql(expectation(3))
        expect(d.findRelation(1, 'mal', 8)).to.eql(expectation(3))
        expect(d.findRelation(1, 'mal', 9)).to.eql(expectation(3))
        expect(d.findRelation(1, 'mal', 0)).to.eq(null)
        expect(d.findRelation(2, 'mal', 1)).to.eq(null)
    })
})
