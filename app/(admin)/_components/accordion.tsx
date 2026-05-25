"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface AccordionItem<T> {
  id: string;
  header: React.ReactNode;
  body: React.ReactNode;
  data?: T;
}

interface AccordionProps<T> {
  items: AccordionItem<T>[];
  defaultOpenId?: string | null;
}

export function Accordion<T>({
  items,
  defaultOpenId = null,
}: AccordionProps<T>) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div
            key={item.id}
            className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : item.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/50 transition-colors"
            >
              <div className="flex-1 min-w-0">{item.header}</div>
              <div className="ml-3 shrink-0 text-muted-foreground">
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </div>
            </button>
            {isOpen && (
              <div className="border-t px-4 py-4 bg-background/50">
                {item.body}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
