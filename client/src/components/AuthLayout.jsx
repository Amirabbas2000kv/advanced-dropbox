export default function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}) {
  return (
    <main className="auth-page">
      <section className="auth-main">
        <div className="auth-content">
          <header className="brand">
            <div className="brand-mark">D</div>
            <span>Advanced Dropbox</span>
          </header>

          <div className="auth-card">
            <p className="eyebrow">{eyebrow}</p>

            <h1>{title}</h1>

            <p className="auth-subtitle">
              {subtitle}
            </p>

            {children}
          </div>

          {footer && (
            <p className="auth-footer">
              {footer}
            </p>
          )}
        </div>
      </section>

      <aside className="auth-visual">
        <div className="visual-content">
          <div className="visual-icon">☁</div>

          <p className="visual-eyebrow">
            YOUR PERSONAL CLOUD
          </p>

          <h2>
            Your files.
            <br />
            Your space.
            <br />
            Your control.
          </h2>

          <p className="visual-description">
            Store, organize and access your files
            securely from one simple workspace.
          </p>

          <div className="visual-card">
            <div className="visual-card-top">
              <span>Cloud Storage</span>
              <span className="online-dot"></span>
            </div>

            <div className="visual-progress">
              <span></span>
            </div>

            <div className="visual-card-bottom">
              <span>Secure workspace</span>
              <span>Ready</span>
            </div>
          </div>
        </div>

        <div className="visual-circle circle-one"></div>
        <div className="visual-circle circle-two"></div>
      </aside>
    </main>
  );
}