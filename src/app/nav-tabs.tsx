"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Programme" },
  { href: "/ladder", label: "Ladder" },
  { href: "/live", label: "Live", rec: true },
  { href: "/teams", label: "Who’s got who" },
  { href: "/draw", label: "The draw" },
  { href: "/how", label: "How it works" },
  { href: "/admin", label: "Results desk" },
];

export default function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap">
      {TABS.map(({ href, label, rec }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={`nav-tab${active ? " is-active" : ""}`}>
            {rec && <span className="rec-dot" aria-hidden />}
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
