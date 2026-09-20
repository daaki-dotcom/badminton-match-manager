interface LinkItem {
  label: string
  url: string
}

const LINKS: LinkItem[] = [
  { label: 'バド部に関する表示はこちら', url: 'https://tomin-ai-sandbox.github.io/bold-badminton-club/' },
]

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-links">
        <span className="footer-links-label">関連サイト</span>
        <div className="footer-links-list">
          {LINKS.map(link => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
