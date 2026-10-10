// 回答フォームの連続送信を抑える簡易な制限（同じ端末・同じブラウザ単位）。
// 画面操作での誤操作・単純な連打・簡易な自動送信を止めるためのもの。
// ブラウザの外から直接データベースを叩く攻撃は止められない（それは App Check の役割）。
const STORAGE_KEY = 'badminton.submitTimes'

const RULES = [
  { windowMs: 10 * 60 * 1000, max: 5, label: '10分' },
  { windowMs: 24 * 60 * 60 * 1000, max: 15, label: '24時間' },
]

function load(): number[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as number[]
    return list.filter(t => typeof t === 'number')
  } catch { return [] }
}

// 送信してよければ回数を記録して null を返す。制限に達していれば、利用者向けの案内文を返す
export function tryConsumeSubmit(now = Date.now()): string | null {
  const times = load().filter(t => now - t < RULES[RULES.length - 1].windowMs)
  for (const r of RULES) {
    const recent = times.filter(t => now - t < r.windowMs)
    if (recent.length >= r.max) {
      const waitMin = Math.max(1, Math.ceil((recent[0] + r.windowMs - now) / 60000))
      return `送信回数が多すぎます（${r.label}に${r.max}回まで）。約${waitMin}分後にもう一度お試しください。`
    }
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...times, now])) } catch { /* 保存できない環境では制限なしで続行 */ }
  return null
}
