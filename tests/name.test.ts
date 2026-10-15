import { beforeEach, describe, expect, test } from 'bun:test'
import { introduceMe, renameMe } from '@/data/actions'
import { jsonToFile } from '@/data/files'
import { applyFiles, resetProjection } from '@/data/project'
import { EMPTY, useData } from '@/data/store'
import type { Person } from '@/model/schema'

const github: Person = { login: 'darekk', githubId: 42, name: 'Darek S', avatarUrl: 'a.png' }
const file = (p: object) => applyFiles(new Map([['people/darekk.json', jsonToFile(p)]]), 'darekk')
const mine = () => useData.getState().people.darekk

beforeEach(() => {
  resetProjection()
  useData.setState({ ...EMPTY, me: github })
})

describe('your name', () => {
  test('comes from GitHub, and follows it when it changes there', () => {
    introduceMe(github)
    expect(mine().name).toBe('Darek S')
    introduceMe({ ...github, name: 'Darek Smith' })
    expect(mine().name).toBe('Darek Smith')
  })

  test('a name you type here stays, while your picture still follows GitHub', () => {
    introduceMe(github)
    renameMe('  Dariusz   Smith ')
    expect(mine()).toMatchObject({ name: 'Dariusz Smith', nameSetHere: true })
    introduceMe({ ...github, name: 'Darek Smith', avatarUrl: 'b.png' })
    expect(mine()).toMatchObject({ name: 'Dariusz Smith', avatarUrl: 'b.png' })
  })

  test('empty, or your GitHub name, goes back to following GitHub', () => {
    introduceMe(github)
    renameMe('Dariusz')
    renameMe('')
    expect(mine().name).toBe('Darek S')
    expect(mine().nameSetHere).toBeUndefined()
    renameMe('Dariusz')
    renameMe('Darek S')
    expect(mine().nameSetHere).toBeUndefined()
  })

  test('no name on GitHub: the name linked from Linear stays', () => {
    useData.setState({ me: { ...github, name: 'darekk' } })
    file({ ...github, name: 'Darek Smith', githubId: 42, linearIds: ['u-1'] })
    introduceMe({ ...github, name: 'darekk' })
    expect(mine()).toMatchObject({ name: 'Darek Smith', linearIds: ['u-1'] })
    // once they set a name on GitHub, that one shows
    introduceMe(github)
    expect(mine().name).toBe('Darek S')
  })
})
