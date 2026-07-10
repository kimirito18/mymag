import { BookOpen, CircleX, Globe, LibraryBig, RefreshCcw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import notFoundImage from "../../imgs/404.png";
import nodbImage from "../../imgs/nodb.png";
import unexpectedErrorImage from "../../imgs/500.png";

type ErrorDisplayProps = {
  actionLabel?: string;
  actionOnClick?: ()=>void;
  accentIcon?: ReactNode;
  description: string;
  homeHref?: string;
  homeLabel?: string;
  illustration: "bookshelf-collapse" | "library-closed";
  secondaryHref?: string;
  secondaryLabel?: string;
  title: string;
};

function BookshelfCollapseIllustration() {
  return (
    <svg className="error-illustration-svg" viewBox="0 0 720 420" aria-hidden="true">
      <defs>
        <linearGradient id="shelfBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f4fbf8" />
          <stop offset="100%" stopColor="#dceee8" />
        </linearGradient>
      </defs>
      <rect x="34" y="36" width="652" height="348" rx="34" fill="url(#shelfBg)" />
      <rect x="112" y="118" width="82" height="198" rx="16" fill="#1f8f89" opacity="0.16" />
      <rect x="198" y="118" width="316" height="22" rx="11" fill="#d0e4de" />
      <rect x="198" y="192" width="286" height="22" rx="11" fill="#d0e4de" />
      <rect x="198" y="266" width="248" height="22" rx="11" fill="#d0e4de" />
      <rect x="220" y="110" width="36" height="126" rx="12" fill="#187f78" />
      <rect x="262" y="104" width="34" height="132" rx="12" fill="#225767" />
      <rect x="302" y="114" width="30" height="122" rx="12" fill="#8ba8bf" />
      <rect x="338" y="108" width="42" height="128" rx="12" fill="#f1c77d" />
      <rect x="388" y="118" width="28" height="118" rx="12" fill="#a95e5e" />
      <g transform="translate(444 214) rotate(22)">
        <rect x="0" y="0" width="38" height="130" rx="12" fill="#d87067" />
        <rect x="44" y="-12" width="42" height="142" rx="12" fill="#3a667a" />
        <rect x="92" y="8" width="30" height="122" rx="12" fill="#1e918b" />
      </g>
      <g transform="translate(514 278) rotate(70)">
        <rect x="0" y="0" width="32" height="112" rx="12" fill="#f2b56f" />
      </g>
      <path d="M182 322c18-36 38-63 78-77 36-12 72-6 112 2 66 14 126 26 212-8" fill="none" stroke="#8fb1ad" strokeWidth="10" strokeLinecap="round" opacity="0.7" />
      <circle cx="568" cy="112" r="34" fill="#ffffff" />
      <CircleX className="error-illustration-overlay" x={534} y={78} width={68} height={68} strokeWidth={1.8} color="#52708a" />
    </svg>
  );
}

function LibraryClosedIllustration() {
  return (
    <svg className="error-illustration-svg" viewBox="0 0 720 420" aria-hidden="true">
      <defs>
        <linearGradient id="libraryBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#edf7f5" />
          <stop offset="100%" stopColor="#dce8e6" />
        </linearGradient>
      </defs>
      <rect x="34" y="36" width="652" height="348" rx="34" fill="url(#libraryBg)" />
      <rect x="144" y="132" width="432" height="186" rx="22" fill="#fffdfa" stroke="#ceded9" strokeWidth="6" />
      <rect x="182" y="174" width="356" height="116" rx="16" fill="#173342" />
      <rect x="222" y="194" width="76" height="76" rx="12" fill="#edf7f5" opacity="0.16" />
      <rect x="316" y="194" width="76" height="76" rx="12" fill="#edf7f5" opacity="0.16" />
      <rect x="410" y="194" width="90" height="76" rx="12" fill="#edf7f5" opacity="0.16" />
      <rect x="122" y="110" width="476" height="26" rx="13" fill="#c7ddd7" />
      <path d="M154 118 360 72l206 46" fill="#f8fbfa" stroke="#c7ddd7" strokeWidth="6" strokeLinejoin="round" />
      <LibraryBig x={298} y={90} width={124} height={124} color="#eff8f4" strokeWidth={1.8} />
      <g transform="translate(454 114)">
        <circle cx="0" cy="0" r="38" fill="#ffffff" />
        <CircleX x="-28" y="-28" width={56} height={56} color="#54728d" strokeWidth={1.8} />
      </g>
      <rect x="278" y="332" width="164" height="26" rx="13" fill="#d4e4de" />
    </svg>
  );
}

function AccentCompositeIcon({
  icon
}: {
  icon: ReactNode;
}) {
  return (
    <span className="error-accent-composite">
      {icon}
      <CircleX size={12} className="error-accent-composite-mark" />
    </span>
  );
}

export function ErrorDisplay({
  actionLabel,
  actionOnClick,
  accentIcon,
  description,
  homeHref = "/",
  homeLabel = "ホームへ戻る",
  illustration,
  secondaryHref,
  secondaryLabel,
  title
}: ErrorDisplayProps) {
  return (
    <main className="error-screen">
      <section className="error-panel">
        <header className="error-panel-header">
          <div className="error-panel-copy">
            <div className="error-panel-badge">
              <BookOpen size={16} />
              mymag
            </div>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {accentIcon ? <div className="error-panel-accent" aria-hidden="true">{accentIcon}</div> : null}
        </header>

        <div className="error-illustration">
          {illustration === "bookshelf-collapse" ? <BookshelfCollapseIllustration /> : <LibraryClosedIllustration />}
        </div>

        <footer className="error-panel-footer">
          {actionLabel && actionOnClick ? <button type="button" className="primary-button error-link-button" onClick={actionOnClick}>
            <RefreshCcw size={16} />
            {actionLabel}
          </button> : <Link href={homeHref} className="primary-button error-link-button">
            <RefreshCcw size={16} />
            {homeLabel}
          </Link>}
          {secondaryHref && secondaryLabel ? <Link href={secondaryHref} className="secondary-button error-link-button">
            {secondaryLabel}
          </Link> : null}
        </footer>
      </section>
    </main>
  );
}

export function GeneralNotFoundPage() {
  return (
    <main className="error-screen">
      <div style={{ width: "100%", display: "flex", justifyContent: "center", padding: "24px" }}>
        <Image
          src={notFoundImage}
          alt="404エラーを示す画像"
          priority
          style={{ width: "100%", maxWidth: "1200px", height: "auto", display: "block" }}
        />
      </div>
    </main>
  );
}

export function DatabaseUnavailablePage() {
  return (
    <main className="error-screen">
      <div style={{ width: "100%", display: "flex", justifyContent: "center", padding: "24px" }}>
        <Image
          src={nodbImage}
          alt="データベースに接続できない状態を示す画像"
          priority
          style={{ width: "100%", maxWidth: "1200px", height: "auto", display: "block" }}
        />
      </div>
    </main>
  );
}

export function UnexpectedErrorPage({ reset }: { reset?: ()=>void }) {
  return (
    <main className="error-screen">
      <div style={{ width: "100%", display: "flex", justifyContent: "center", padding: "24px" }}>
        <Image
          src={unexpectedErrorImage}
          alt="500エラーを示す画像"
          priority
          style={{ width: "100%", maxWidth: "1200px", height: "auto", display: "block" }}
        />
      </div>
    </main>
  );
}
