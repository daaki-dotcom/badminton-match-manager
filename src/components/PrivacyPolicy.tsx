interface Props {
  onClose: () => void
}

export function PrivacyPolicy({ onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: 480, maxHeight: '80vh', overflowY: 'auto' }}>
        <div className="modal-title">📄 プライバシーポリシー</div>

        <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text)' }}>
          <p style={{ marginBottom: '1rem' }}>
            本アプリ（バドミントン試合管理ツール）における個人情報の取り扱いについて、以下の通りお知らせします。
          </p>

          <h4 style={{ fontSize: 13, marginBottom: 4 }}>1. 運営者</h4>
          <p style={{ marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
            本アプリは、社内バドミントン部の活動管理を目的として、部の運営担当者が個人で開発・運用しています。
          </p>

          <h4 style={{ fontSize: 13, marginBottom: 4 }}>2. 取得する情報</h4>
          <ul style={{ marginBottom: '0.75rem', color: 'var(--text-muted)', paddingLeft: '1.2rem' }}>
            <li>お名前</li>
            <li>出欠状況（参加・不参加・未定）</li>
            <li>試合結果（スコア・順位）</li>
            <li>懇親会の参加意思</li>
            <li>部費・懇親会費の支払い状況</li>
            <li>任意でご入力いただいたコメント</li>
            <li>経験者・未経験者の区分</li>
          </ul>

          <h4 style={{ fontSize: 13, marginBottom: 4 }}>3. 利用目的</h4>
          <p style={{ marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
            上記の情報は、部活動の出欠管理・試合の組み合わせ作成・懇親会の準備・会費管理のためにのみ利用します。
          </p>

          <h4 style={{ fontSize: 13, marginBottom: 4 }}>4. 第三者提供</h4>
          <p style={{ marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
            取得した情報を、部員以外の第三者に提供することはありません。
          </p>

          <h4 style={{ fontSize: 13, marginBottom: 4 }}>5. 保存期間・削除</h4>
          <ul style={{ marginBottom: '0.75rem', color: 'var(--text-muted)', paddingLeft: '1.2rem' }}>
            <li>出欠・試合結果等の活動データは、活動日から7日後に自動的にリセットされます</li>
            <li>ゲストとして登録した情報は、活動日から7日後に自動的に削除されます</li>
            <li>正規部員として登録した情報（お名前・IDなど）は、退部の申し出があった時点で削除します</li>
          </ul>

          <h4 style={{ fontSize: 13, marginBottom: 4 }}>6. 開示・訂正・削除のご依頼</h4>
          <p style={{ marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
            ご自身の情報の確認・訂正・削除をご希望の場合は、部の運営担当者（管理者権限を持つ部員）までお申し出ください。
          </p>

          <h4 style={{ fontSize: 13, marginBottom: 4 }}>7. お問い合わせ</h4>
          <p style={{ marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
            本アプリの個人情報の取り扱いに関するお問い合わせは、部の運営担当者までご連絡ください。
          </p>

          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: '1rem' }}>
            制定日：2026年9月24日
          </p>
        </div>

        <button className="btn btn-accent" style={{ width: '100%', marginTop: '1rem' }} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  )
}
