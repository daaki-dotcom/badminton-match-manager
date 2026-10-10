import { Match } from './types'

// ダブルスの組を「田中 / 鈴木」の形で1つの文字列にして保存している。
// この区切りの知識はこのファイルだけに持たせ、他の場所は必ずここの関数を通す。
const PLAYER_SEP = ' / '

export const splitPlayers = (s: string): string[] => s.split(PLAYER_SEP)
export const joinPlayers = (names: string[]): string => names.join(PLAYER_SEP)

// その名前の人が、この試合に出ているか
export const matchHasPlayer = (m: Match, name: string): boolean =>
  splitPlayers(m.p1).includes(name) || splitPlayers(m.p2).includes(name)

// 区切り文字「/」を含む名前は、組み合わせの文字列を壊すため登録させない
export const isValidPlayerName = (name: string): boolean => !name.includes('/')
export const INVALID_NAME_MESSAGE = '名前に「/」は使えません'
