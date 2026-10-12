import { SAMPLE_NAMES } from '../matchUtils'

// サンプル参加者（田中太郎）の表示例。各画面の一番上に出す。
// 画面に渡すデータからは外してあるので、集計・組み合わせ・操作には一切関わらない。
const NAME = SAMPLE_NAMES[0]

export function SamplePill() {
  return <span className="sample-pill">サンプル</span>
}

type Kind = 'home' | 'members' | 'matches' | 'results' | 'party'

function Example({ kind }: { kind: Kind }) {
  switch (kind) {
    case 'home':
      return <div className="sample-line"><b>{NAME}</b> <SamplePill /> ✅ 参加 ／ <span className="badge-nov">未経験者</span></div>
    case 'members':
      return (
        <table className="member-table"><tbody>
          <tr>
            <td style={{ fontWeight: 500 }}>{NAME} <SamplePill /></td>
            <td><span className="type-badge type-guest">ゲスト</span></td>
            <td><span className="badge-nov">未経験者</span></td>
            <td>部活費 —</td><td>懇親会費 —</td>
          </tr>
        </tbody></table>
      )
    case 'matches':
      return (
        <div className="match-item wait">
          <div className="match-left">
            <div className="match-team">{NAME} <SamplePill /></div>
            <div className="match-meta">C1</div>
            <div className="match-team">山田 花子</div>
          </div>
          <div className="match-right"><div className="match-score-readonly"><span className="score-num">21</span><span className="vs">vs</span><span className="score-num">15</span></div></div>
        </div>
      )
    case 'results':
      return (
        <div className="rank-row">
          <div className="rank-pos top">🥇</div>
          <div className="rank-name"><div>{NAME} <SamplePill /></div><div style={{ marginTop: 3 }}><span className="badge-nov">未経験者</span></div></div>
          <div className="rank-wl">2勝0敗</div>
          <div className="rank-pts">4<span style={{ fontSize: 11, color: 'var(--text-muted)' }}>pt</span></div>
        </div>
      )
    case 'party':
      return <div className="sample-line"><b>{NAME}</b> <SamplePill /> 懇親会：参加 ／ 不参加 を選ぶ表示例</div>
  }
}

export function SampleCard({ kind }: { kind: Kind }) {
  return (
    <div className="sample-card" aria-label="サンプル表示">
      <div className="sample-head">📋 表示例（サンプル）— 集計・組み合わせ・操作の対象外です</div>
      <Example kind={kind} />
    </div>
  )
}
