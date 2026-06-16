# Shadcn/UI Guide

## Core Principle
All UI components MUST use shadcn/ui. No custom component libraries.

## Setup (already included in templates)
```bash
npx shadcn@latest init
```

## Adding Components
```bash
npx shadcn@latest add button
npx shadcn@latest add table
npx shadcn@latest add dialog
npx shadcn@latest add form
npx shadcn@latest add input
npx shadcn@latest add select
npx shadcn@latest add card
npx shadcn@latest add badge
npx shadcn@latest add tabs
npx shadcn@latest add dropdown-menu
npx shadcn@latest add command
npx shadcn@latest add sheet
npx shadcn@latest add toast (use sonner)
npx shadcn@latest add chart (uses recharts)
```

## Rules
- ALWAYS check if a shadcn component exists before building custom
- Use `class-variance-authority` (cva) for variant patterns
- Use `clsx` + `tailwind-merge` via `cn()` utility for class merging
- Import from `@/components/ui/` path
- Never modify generated shadcn files — extend via wrapper components
- Use Tailwind for ALL styling (no CSS modules, styled-components)

## Form Pattern (React Hook Form + Zod + Shadcn)
```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
```

## Table Pattern (TanStack React Table + Shadcn)
```tsx
import { DataTable } from "@/components/ui/data-table";
// Use TanStack columns definition with shadcn Table underneath
```

## Chart Pattern (Recharts + Shadcn Chart)
```tsx
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis } from "recharts";
```

## Status Badges
Always define status colors in a central `lib/status-colors.ts` file.
Never hardcode badge colors inline.
