const LINKS = [
  { href: "https://github.com/MikaBuchholz/stoneshard-editor", label: "Source on GitHub" },
  { href: "https://store.steampowered.com/app/625960/Stoneshard/", label: "Stoneshard on Steam" },
  { href: "https://stoneshard.com/wiki/Stoneshard_Wiki", label: "Official wiki" },
];

/** Ownership notice, links and credits. Shown on every screen. */
export function LegalNotice() {
  return (
    <footer className="legal">
      <p>
        Stoneshard and every game asset shown here — item and skill icons, skill tree panels and in-game text — belong to
        Ink Stains Games and HypeTrain Digital. This is an unofficial fan-made tool, not affiliated with or endorsed by
        them, and it claims no ownership of their work. Skill descriptions and tree panels come from the official wiki.
      </p>
      <p className="legal-links">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} target="_blank" rel="noreferrer noopener">
            {link.label}
          </a>
        ))}
      </p>
      <p>
        Written with{" "}
        <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer noopener">
          Claude
        </a>
        , Anthropic's AI assistant, which did most of the coding, reverse-engineering of the save format and asset
        extraction.
      </p>
    </footer>
  );
}
