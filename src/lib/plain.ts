/**
 * Text made easy to search: lower case, without accents, so "lukasz" finds Łukasz and "zazolc" finds "Zażółć".
 * Every search box uses it, so typing without Polish letters works everywhere.
 */
export const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ł/g, 'l')
