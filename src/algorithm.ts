import { Match } from './types'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface GenerateOptions {
  pool: string[]
  courts: number
  matchType: 'singles' | 'doubles'
  ruleEqual: boolean
  ruleConsec: boolean
  limitPer: number      // 1人あたり（シングルスのみ）
  limitTotal: number    // 合計上限
  isNoneMode: boolean   // 指定しない
}

function shouldRelaxConsec(pool: string[], courts: number, matchType: 'singles' | 'doubles'): boolean {
  const perMatch = matchType === 'singles' ? 2 : 4
  // 1ラウンドの出場人数と待機人数を計算し、待機人数が1試合分未満なら緩和する
  const sitsOut = pool.length - courts * perMatch
  return sitsOut < perMatch
}

// ── シングルス ──
export function generateSingles(opts: GenerateOptions): Match[] | null {
  const { pool, courts, ruleEqual, ruleConsec, limitPer, limitTotal, isNoneMode } = opts
  const n = pool.length
  const relaxConsec = shouldRelaxConsec(pool, courts, 'singles')

  const allCombos: { p1: string; p2: string }[] = []
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      allCombos.push({ p1: pool[i], p2: pool[j] })

  let targetTotal: number
  if (isNoneMode) {
    targetTotal = allCombos.length
  } else if (limitPer > 0) {
    if (ruleEqual && (n * limitPer) % 2 !== 0) {
      if (!confirm(`${n}人で1人${limitPer}試合は均等にできません。\nこのまま続けますか？`)) return null
    }
    targetTotal = Math.floor(n * limitPer / 2)
  } else if (limitTotal > 0) {
    if (ruleEqual && (limitTotal * 2) % n !== 0) {
      if (!confirm(`合計${limitTotal}試合では全員均等になりません。\nこのまま続けますか？`)) return null
    }
    targetTotal = limitTotal
  } else {
    alert('試合数を指定してください。')
    return null
  }

  return buildSinglesRounds(pool, allCombos, targetTotal, courts, ruleEqual, ruleConsec, relaxConsec, limitPer)
}

function buildSinglesRounds(
  pool: string[],
  allCombos: { p1: string; p2: string }[],
  targetTotal: number,
  courts: number,
  ruleEqual: boolean,
  ruleConsec: boolean,
  relaxConsec: boolean,
  limitPer: number,
): Match[] | null {
  const playCount: Record<string, number> = {}
  pool.forEach(p => { playCount[p] = 0 })
  const generated: { p1: string; p2: string }[] = []
  const rounds: { p1: string; p2: string }[][] = []
  let remaining = shuffle([...allCombos])

  while (generated.length < targetTotal) {
    const minCount = Math.min(...pool.map(p => playCount[p]))
    if (limitPer > 0 && minCount >= limitPer) break

    const round: { p1: string; p2: string }[] = []
    const usedThisRound = new Set<string>()

    const prevRoundPlayers = new Set<string>()
    if (!relaxConsec && ruleConsec && rounds.length > 0) {
      const prev = rounds[rounds.length - 1]
      prev.forEach(m => { prevRoundPlayers.add(m.p1); prevRoundPlayers.add(m.p2) })
    }

    for (let slot = 0; slot < courts && generated.length + round.length < targetTotal; slot++) {
      // パス1：連続不可 + 均等 + 同ラウンド重複なし
      let found = false
      for (let i = 0; i < remaining.length; i++) {
        const c = remaining[i]
        if (usedThisRound.has(c.p1) || usedThisRound.has(c.p2)) continue
        if (prevRoundPlayers.has(c.p1) || prevRoundPlayers.has(c.p2)) continue
        if (limitPer > 0 && (playCount[c.p1] >= limitPer || playCount[c.p2] >= limitPer)) continue
        if (ruleEqual && playCount[c.p1] > minCount && playCount[c.p2] > minCount) continue
        remaining.splice(i, 1)
        round.push(c); usedThisRound.add(c.p1); usedThisRound.add(c.p2)
        found = true; break
      }

      // パス2：連続不可緩和
      if (!found) {
        for (let i = 0; i < remaining.length; i++) {
          const c = remaining[i]
          if (usedThisRound.has(c.p1) || usedThisRound.has(c.p2)) continue
          if (limitPer > 0 && (playCount[c.p1] >= limitPer || playCount[c.p2] >= limitPer)) continue
          if (ruleEqual && playCount[c.p1] > minCount && playCount[c.p2] > minCount) continue
          remaining.splice(i, 1)
          round.push(c); usedThisRound.add(c.p1); usedThisRound.add(c.p2)
          found = true; break
        }
      }

      // パス3：均等緩和
      if (!found) {
        for (let i = 0; i < remaining.length; i++) {
          const c = remaining[i]
          if (usedThisRound.has(c.p1) || usedThisRound.has(c.p2)) continue
          if (limitPer > 0 && (playCount[c.p1] >= limitPer || playCount[c.p2] >= limitPer)) continue
          remaining.splice(i, 1)
          round.push(c); usedThisRound.add(c.p1); usedThisRound.add(c.p2)
          found = true; break
        }
      }
      if (!found) break
    }

    if (round.length === 0) {
      remaining = shuffle([...allCombos].filter(c => {
        if (limitPer > 0 && (playCount[c.p1] >= limitPer || playCount[c.p2] >= limitPer)) return false
        return true
      }))
      if (remaining.length === 0) break
      continue
    }

    round.forEach(c => { playCount[c.p1]++; playCount[c.p2]++ })
    rounds.push(round)
    generated.push(...round)

    if (remaining.length === 0 && !limitPer) {
      remaining = shuffle([...allCombos])
    }
  }

  if (!generated.length) { alert('条件を満たす組み合わせが見つかりませんでした。'); return null }
  return generated.map(c => ({ ...c, s1: '', s2: '', status: 'wait' as const, court: 0 }))
}

// ── ダブルス ──
export function generateDoubles(opts: GenerateOptions): Match[] | null {
  const { pool, courts, ruleEqual, ruleConsec, limitTotal, isNoneMode } = opts
  const n = pool.length
  if (n < 4) { alert('ダブルスには4人以上必要です。'); return null }

  const relaxConsec = shouldRelaxConsec(pool, courts, 'doubles')
  const maxGames = isNoneMode ? 99999 : (limitTotal > 0 ? limitTotal : 99999)

  if (!isNoneMode && ruleEqual && limitTotal > 0 && (limitTotal * 4) % n !== 0) {
    if (!confirm(`合計${limitTotal}試合では全員均等になりません。\nこのまま続けますか？`)) return null
  }

  const playCount: Record<string, number> = {}
  pool.forEach(p => { playCount[p] = 0 })
  const pairCount: Record<string, number> = {}
  const pKey = (a: string, b: string) => [a, b].sort().join('__')
  const getPair = (a: string, b: string) => pairCount[pKey(a, b)] || 0
  const addPair = (a: string, b: string) => { const k = pKey(a, b); pairCount[k] = (pairCount[k] || 0) + 1 }

  const generated: Match[] = []
  const rounds: Match[][] = []
  let failStreak = 0
  const MAX_FAIL = 50

  while (generated.length < maxGames && failStreak < MAX_FAIL) {
    if (isNoneMode && pool.every(p => playCount[p] >= 4)) break

    const round: Match[] = []
    const usedThisRound = new Set<string>()

    const prevRoundPlayers = new Set<string>()
    if (!relaxConsec && ruleConsec && rounds.length > 0) {
      const prev = rounds[rounds.length - 1]
      prev.forEach(m => {
        m.p1.split(' / ').forEach((p: string) => prevRoundPlayers.add(p))
        m.p2.split(' / ').forEach((p: string) => prevRoundPlayers.add(p))
      })
    }

    const phase1Done = pool.every(p => playCount[p] >= 1)
    const prevRoundPairs = rounds.length > 0
      ? rounds[rounds.length - 1].map(m => [m.p1.split(' / '), m.p2.split(' / ')])
      : []

    for (let slot = 0; slot < courts && generated.length + round.length < maxGames; slot++) {
      const candidates = shuffle(pool)
        .filter(p => !usedThisRound.has(p))
        .sort((a, b) => playCount[a] - playCount[b])

      if (candidates.length < 4) break

      let bestMatch: { t1: string[]; t2: string[] } | null = null

      for (let ai = 0; ai < candidates.length && !bestMatch; ai++) {
        for (let bi = ai + 1; bi < candidates.length && !bestMatch; bi++) {
          for (let ci = bi + 1; ci < candidates.length && !bestMatch; ci++) {
            for (let di = ci + 1; di < candidates.length && !bestMatch; di++) {
              const four = [candidates[ai], candidates[bi], candidates[ci], candidates[di]]

              if (!relaxConsec && ruleConsec && four.some(p => prevRoundPlayers.has(p))) continue

              const opts2 = [
                { t1: [four[0], four[1]], t2: [four[2], four[3]] },
                { t1: [four[0], four[2]], t2: [four[1], four[3]] },
                { t1: [four[0], four[3]], t2: [four[1], four[2]] },
              ]

              const validOpts = opts2.filter(o => {
                if (!phase1Done) {
                  return getPair(o.t1[0], o.t1[1]) === 0 && getPair(o.t2[0], o.t2[1]) === 0
                } else {
                  return !prevRoundPairs.some(([lp1, lp2]) =>
                    (lp1[0] === o.t1[0] && lp1[1] === o.t1[1]) || (lp1[0] === o.t2[0] && lp1[1] === o.t2[1]) ||
                    (lp2[0] === o.t1[0] && lp2[1] === o.t1[1]) || (lp2[0] === o.t2[0] && lp2[1] === o.t2[1])
                  )
                }
              })

              if (validOpts.length === 0) continue

              validOpts.sort((a, b) =>
                (getPair(a.t1[0], a.t1[1]) + getPair(a.t2[0], a.t2[1])) -
                (getPair(b.t1[0], b.t1[1]) + getPair(b.t2[0], b.t2[1]))
              )
              bestMatch = validOpts[0]
            }
          }
        }
      }

      if (!bestMatch) { failStreak++; break }

      addPair(bestMatch.t1[0], bestMatch.t1[1])
      addPair(bestMatch.t2[0], bestMatch.t2[1])
      bestMatch.t1.forEach(p => { playCount[p]++; usedThisRound.add(p) })
      bestMatch.t2.forEach(p => { playCount[p]++; usedThisRound.add(p) })

      round.push({ p1: bestMatch.t1.join(' / '), p2: bestMatch.t2.join(' / '), s1: '', s2: '', status: 'wait', court: 0 })
      failStreak = 0
    }

    if (round.length === 0) { failStreak++; continue }
    rounds.push(round)
    generated.push(...round)
    failStreak = 0
  }

  if (!generated.length) { alert('条件を満たす組み合わせが見つかりませんでした。\n人数・コート数の設定を確認してください。'); return null }
  return generated
}
