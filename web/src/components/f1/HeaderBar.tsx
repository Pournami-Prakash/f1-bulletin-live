"use client";

import { APP_NAME, APP_TAGLINE } from "@/config/f1";

export default function HeaderBar() {
  return (
    <div className="relative overflow-hidden border-b border-zinc-900">
      {/* Background glow effects */}
      <div className="absolute inset-0 opacity-70" aria-hidden>
        <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full blur-3xl bg-[radial-gradient(circle,rgba(225,6,0,0.35),rgba(0,0,0,0))]" />
        <div className="absolute top-24 left-0 right-0 h-14 bg-[linear-gradient(90deg,rgba(225,6,0,0.0),rgba(225,6,0,0.45),rgba(225,6,0,0.0))]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-[rgba(225,6,0,0.55)]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-10">
        <p className="text-xs tracking-[0.25em] text-zinc-400 uppercase">{APP_NAME}</p>
        <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mt-2">
          Live Bulletin <span className="text-[rgba(225,6,0,0.9)]">•</span> Timeline{" "}
          <span className="text-[rgba(225,6,0,0.9)]">•</span> Pulse
        </h1>
        <p className="text-zinc-300 mt-2 max-w-2xl">{APP_TAGLINE}</p>
      </div>
    </div>
  );
}
