import { expect, test } from 'bun:test'
import { fuzzy } from '@/lib/fuzzy'

const people = [
  { name: 'Anna Kowalska', login: 'ania-k' },
  { name: 'Darek Smith', login: 'darekk' },
  { name: 'Bartek Nowak', login: 'bartek' },
]
const words = (p: (typeof people)[number]) => [p.name, p.login]

test('nothing typed: everyone, in their own order', () => {
  expect(fuzzy(people, '  ', words)).toEqual(people)
})

test('loose matches, best first', () => {
  expect(fuzzy(people, 'drk smi', words).map((p) => p.login)).toEqual(['darekk'])
  expect(fuzzy(people, 'ania', words)[0].login).toBe('ania-k')
  expect(fuzzy(people, 'nowak', words)[0].login).toBe('bartek')
  expect(fuzzy(people, 'zzz', words)).toEqual([])
})

test('accents don’t matter, either way round', () => {
  const pl = [{ name: 'Łukasz Bąk', login: 'lb' }, { name: 'Zosia Wiśniewska', login: 'zw' }]
  expect(fuzzy(pl, 'lukasz bak', words)[0].login).toBe('lb')
  expect(fuzzy(pl, 'wisniewska', words)[0].login).toBe('zw')
  expect(fuzzy([{ name: 'Lukasz', login: 'l' }], 'Łukasz', words)).toHaveLength(1)
})
