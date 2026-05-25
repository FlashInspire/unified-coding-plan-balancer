"use client";

import { useEffect, useState } from "react";

function isNvmjsDomain(hostname: string): boolean {
  return hostname === "nvmjs.com" || hostname.endsWith(".nvmjs.com");
}

function detectEmbeddedInNvmjs(): boolean {
  if (typeof window === "undefined") return false;
  if (window.self === window.top) return false;

  try {
    const topHost = window.top?.location.hostname;
    if (topHost && isNvmjsDomain(topHost)) {
      return true;
    }
  } catch {
    const referrer = document.referrer;
    if (referrer) {
      try {
        const url = new URL(referrer);
        if (isNvmjsDomain(url.hostname)) {
          return true;
        }
      } catch {
        // ignore invalid referrer
      }
    }
  }

  return false;
}

export function FrameGuard() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (detectEmbeddedInNvmjs()) {
      setBlocked(true);
    }
  }, []);

  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80">
      <button
        onClick={() => {
          window.open(window.location.href, "_blank");
        }}
        className="rounded-lg bg-white px-6 py-3 text-base font-medium text-black shadow-lg hover:bg-gray-100"
      >
        新窗口打开
      </button>
    </div>
  );
}
