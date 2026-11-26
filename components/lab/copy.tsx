"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Copies text to the clipboard, falling back to a hidden textarea where the Clipboard API is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CopyButton({ text, label = "Copy", className, variant = "default" }: { text: string; label?: string; className?: string; variant?: "default" | "primary" | "ghost" }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <Button
      size="sm"
      variant={variant}
      className={className}
      onClick={async () => {
        setState((await copyText(text)) ? "done" : "failed");
        setTimeout(() => setState("idle"), 1800);
      }}
    >
      <span aria-live="polite">{state === "done" ? "Copied" : state === "failed" ? "Copy failed" : label}</span>
    </Button>
  );
}
