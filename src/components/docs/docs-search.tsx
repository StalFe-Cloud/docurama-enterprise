"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileText, Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface SearchDocItem {
  title: string;
  slug: string;
  description: string;
  group: string;
}

interface DocsSearchProps {
  items: SearchDocItem[];
}

export function DocsSearch({ items }: DocsSearchProps) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName))) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = (slug: string) => {
    setOpen(false);
    if (slug === "" || slug === "index") {
      router.push("/docs");
    } else {
      router.push(`/docs/${slug}`);
    }
  };

  // Group items by section
  const groups = React.useMemo(() => {
    const map = new Map<string, SearchDocItem[]>();
    for (const item of items) {
      const g = item.group || "Documentation";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Search documentation"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search docs...</span>
        <kbd className="pointer-events-none hidden rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Search Documentation" description="Quickly navigate through Docurama guides and API references">
        <CommandInput placeholder="Type a command or search documentation..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Quick links">
            <CommandItem
              onSelect={() => {
                setOpen(false);
                router.push("/docs");
              }}
            >
              <BookOpen className="mr-2 h-4 w-4" />
              <span>Documentation Overview</span>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setOpen(false);
                router.push("/docs/legal");
              }}
            >
              <FileText className="mr-2 h-4 w-4" />
              <span>Compliance & Legal Hub</span>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setOpen(false);
                router.push("/modeles-de-contrats");
              }}
            >
              <FileText className="mr-2 h-4 w-4" />
              <span>Modèles de contrats français</span>
            </CommandItem>
          </CommandGroup>

          {groups.map(([groupName, groupItems]) => (
            <CommandGroup key={groupName} heading={groupName}>
              {groupItems.map((item) => (
                <CommandItem
                  key={item.slug}
                  value={`${item.title} ${item.description} ${item.group}`}
                  onSelect={() => handleSelect(item.slug)}
                >
                  <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{item.title}</span>
                    {item.description && (
                      <span className="text-xs text-muted-foreground line-clamp-1">{item.description}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
