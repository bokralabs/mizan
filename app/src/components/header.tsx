"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Scale, Moon, Sun, Menu } from "lucide-react";
import { useTheme, useLanguage } from "@/components/providers";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { t, lang, dir, toggleLang } = useLanguage();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  const isAr = lang === "ar";
  const toolsGroup = NAV_GROUPS.find((g) => g.labelKey === "navTools");
  const aboutGroup = NAV_GROUPS.find((g) => g.labelKey === "navAboutMizan");
  const toolsNav = toolsGroup
    ? {
        label: isAr ? toolsGroup.ar : toolsGroup.en,
        items: toolsGroup.items.map((item) => ({
          href: item.href,
          label: isAr ? item.ar : item.en,
        })),
      }
    : null;
  const aboutItems = aboutGroup
    ? aboutGroup.items
        .filter((item) => ["/transparency", "/methodology", "/funding"].includes(item.href))
        .map((item) => ({
          href: item.href,
          label: isAr ? item.ar : item.en,
        }))
    : [];
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className={cn(
      "fixed top-0 inset-x-0 z-50 h-14 border-b transition-all duration-300",
      scrolled
        ? "bg-background/80 backdrop-blur-xl border-border shadow-lg shadow-background/20"
        : "bg-background border-transparent"
    )}>
      <div className="container-page h-full flex items-center gap-6 lg:gap-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 no-underline group">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center transition-transform group-hover:scale-105">
            <Scale size={15} strokeWidth={2} />
          </div>
          <span className="font-black text-lg tracking-tight">{t.siteName}</span>
        </Link>

        {/* Desktop Nav — NavigationMenu for smooth hover-intent UX */}
        <NavigationMenu className="hidden lg:flex flex-1" dir={dir} viewport={false}>
          <NavigationMenuList className="gap-1">
            <NavigationMenuItem>
              <NavigationMenuLink asChild active={pathname === "/"}>
                <Link
                  href="/"
                  className={cn(
                    "inline-flex h-9 items-center justify-center rounded-md px-3 py-2 text-[0.8125rem] font-medium transition-colors outline-none",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus:bg-accent focus:text-accent-foreground",
                    pathname === "/" && "text-primary"
                  )}
                >
                  {t.navHome}
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>

            {toolsNav && (
              <NavigationMenuItem key={toolsNav.label}>
                <NavigationMenuTrigger
                  className={cn(
                    "text-[0.8125rem] font-medium bg-transparent hover:bg-accent",
                    toolsNav.items.some(n => isActive(n.href)) && "text-primary"
                  )}
                >
                  {toolsNav.label}
                </NavigationMenuTrigger>
                <NavigationMenuContent className="min-w-[180px]">
                  <ul className="flex flex-col gap-0.5 p-1.5">
                    {toolsNav.items.map((n) => (
                      <li key={n.href}>
                        <NavigationMenuLink asChild active={isActive(n.href)}>
                          <Link
                            href={n.href}
                            className={cn(
                              "block select-none rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors",
                              "hover:bg-accent hover:text-accent-foreground",
                              isActive(n.href) && "text-primary bg-accent/50"
                            )}
                          >
                            {n.label}
                          </Link>
                        </NavigationMenuLink>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            )}
            {aboutItems.map((item) => (
              <NavigationMenuItem key={item.href}>
                <NavigationMenuLink asChild active={isActive(item.href)}>
                  <Link
                    href={item.href}
                    className={cn(
                      "inline-flex h-9 items-center justify-center rounded-md px-3 py-2 text-[0.8125rem] font-medium transition-colors outline-none",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus:bg-accent focus:text-accent-foreground",
                      isActive(item.href) && "text-primary",
                    )}
                  >
                    {item.label}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        {/* Controls */}
        <div className="flex items-center gap-1.5 ms-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleLang}
            className="h-8 px-2.5 text-xs font-bold text-muted-foreground hover:text-foreground"
            aria-label={t.toggleLang}
          >
            {lang === "ar" ? "En" : "ع"}
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 text-muted-foreground hover:text-foreground">
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8 text-muted-foreground"><Menu size={18} /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 pt-12">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-primary text-primary-foreground flex items-center justify-center"><Scale size={12} strokeWidth={2} /></div>
                  {t.siteName}
                </SheetTitle>
              </SheetHeader>
              <Separator className="my-3" />
              <nav className="flex flex-col gap-0.5 overflow-y-auto max-h-[calc(100vh-8rem)] pb-6" dir={dir}>
                <button
                  type="button"
                  onClick={toggleLang}
                  className="px-3 py-2.5 rounded-lg text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-start"
                >
                  {lang === "ar" ? "English" : "العربية"}
                </button>

                {/* Home */}
                <SheetClose asChild>
                  <Link href="/" className={cn("px-3 py-2.5 rounded-lg text-sm font-medium no-underline transition-colors", isActive("/") ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted")}>{t.navHome}</Link>
                </SheetClose>

                {toolsNav && (
                  <div key={toolsNav.label} className="mt-3">
                    <span className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{toolsNav.label}</span>
                    <div className="flex flex-col gap-0.5 mt-1">
                      {toolsNav.items.map((n) => (
                        <SheetClose asChild key={n.href}>
                          <Link href={n.href} className={cn("px-3 py-2.5 rounded-lg text-sm font-medium no-underline transition-colors", isActive(n.href) ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted")}>{n.label}</Link>
                        </SheetClose>
                      ))}
                    </div>
                  </div>
                )}
                {aboutItems.map((item) => (
                  <SheetClose asChild key={item.href}>
                    <Link href={item.href} className={cn("px-3 py-2.5 rounded-lg text-sm font-medium no-underline transition-colors", isActive(item.href) ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted")}>{item.label}</Link>
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
