"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";

const NAV_LINKS = [
  { label: "Seller",   href: "/app/seller" },
  { label: "Buyer",    href: "/app/buyer" },
  { label: "Investor", href: "/app/investor" },
  { label: "Docs",     href: "/docs" },
];

export function DashboardNav() {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="w-full bg-black flex justify-center pt-0 sticky top-0 z-50">
      <nav className="bg-black rounded-b-2xl md:rounded-b-3xl shadow-xl border-b border-white/5 px-3 py-3 md:px-8 max-w-full">
        <div className="flex items-center gap-3 sm:gap-8 md:gap-12 lg:gap-14 whitespace-nowrap overflow-x-auto no-scrollbar">

          {/* Logo */}
          <Link
            href="/"
            style={{ color: "rgba(225,224,204,0.8)", transition: "color 0.3s ease" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#E1E0CC")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(225,224,204,0.8)")}
            className="font-medium text-[10px] sm:text-xs md:text-sm tracking-widest uppercase select-none"
          >
            Float
          </Link>

          {/* Divider */}
          <span className="w-px h-3 bg-white/10" />

          {/* Nav links */}
          {NAV_LINKS.map((link, i) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  color: active
                    ? "#DEDBC8"
                    : hovered === i
                    ? "#E1E0CC"
                    : "rgba(225,224,204,0.6)",
                  transition: "color 0.3s ease",
                }}
                className="font-medium text-[10px] sm:text-xs md:text-sm tracking-widest uppercase select-none"
              >
                {link.label}
              </Link>
            );
          })}

          {/* Divider */}
          <span className="w-px h-3 bg-white/10" />

          {/* Connect wallet */}
          <div className="shrink-0">
            <ConnectButton
              accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
              chainStatus={{ smallScreen: "none", largeScreen: "icon" }}
              showBalance={false}
            />
          </div>
        </div>
      </nav>
    </div>
  );
}
