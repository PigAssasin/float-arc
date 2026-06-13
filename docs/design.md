# FactorFlow — Design System: Prisma Dark

> **Status:** Official law — sourced directly from `prisma-creative-studio` source code.
> **DO NOT change any rule here without explicit user request.**
> **All pages (landing + app/dashboard) must follow these rules.**

---

## Source Reference

Design copied from `prisma-creative-studio/src/App.tsx` and `src/index.css`.
Every component pattern, color, animation timing, and layout here comes from that source.

---

## Philosophy

Dark. Moody. Cinematic. Warm cream on black. No harsh whites. No sharp brutalist borders.
Depth through gradients and layered backgrounds. Motion is intentional — pull-ups, fade-ins, scroll-linked reveals.
Typography carries personality: **Almarai** for structure, **Instrument Serif italic** for emotion.

---

## Colors (EXACT HEX — DO NOT DEVIATE)

| Token | Value | Role |
|---|---|---|
| `#000000` | Black | Global page background, main container |
| `#0A0A0A` | Near-black | Hero section inner background |
| `#101010` | Dark gray | About card, content cards, form inputs |
| `#212121` | Medium dark gray | Feature cards, secondary cards |
| `#DEDBC8` | Warm cream (primary) | `text-primary`, button bg, check icons, accents |
| `#E1E0CC` | Off-cream | Primary body text, headings (inline style preferred) |
| `rgba(225, 224, 204, 0.8)` | Muted cream 80% | Navbar links default state |
| `#6b7280` | gray-500 | Secondary / muted text |
| `#9ca3af` | gray-400 | Checklist descriptions, captions |
| `#008000` | Success Green | Paid status, Excellent credit |
| `#FFA500` | Warning Orange | Due-soon, Fair credit |
| `#FF0000` | Error Red | Defaulted, errors, New credit tier |

**Selection highlight:** `selection:bg-[#DEDBC8] selection:text-black` — always on root container.

**NO white backgrounds. NO blue/purple accents. NO flat web2 colors.**

---

## Typography (EXACT)

### Fonts — add to `<head>` in layout.tsx

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
<link
  href="https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&family=Instrument+Serif:ital@1&display=swap"
  rel="stylesheet"
/>
```

### globals.css (exact copy from source)

```css
@import "tailwindcss";

@theme {
  --color-primary: #DEDBC8;
  --font-serif: "Instrument Serif", serif;
}

* {
  font-family: 'Almarai', -apple-system, BlinkMacSystemFont, 'Segoe UI',
               'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
}

.noise-overlay {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
}

.bg-noise {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
}
```

### tailwind.config.js

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: { primary: "#DEDBC8" },
      fontFamily: { serif: ['"Instrument Serif"', "serif"] },
    },
  },
  plugins: [],
};
```

### Scale

| Role | Size | Weight | Note |
|---|---|---|---|
| Hero display | `text-[26vw] sm:text-[24vw] md:text-[22vw] lg:text-[20vw]` | 500 | `leading-[0.85] tracking-[-0.07em]` |
| Section heading | `text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl` | 400 | `leading-[0.95] tracking-tight` |
| Card title | `text-base sm:text-lg` | 600 | `tracking-tight` |
| Body text | `text-xs sm:text-sm md:text-base` | 300 | `leading-relaxed` |
| Italic accent | any | italic | `font-serif italic` — Instrument Serif only |
| Label / tag | `text-[10px] sm:text-xs` | 600 | `tracking-[0.2em] uppercase` |
| Nav items | `text-[10px] sm:text-xs md:text-sm` | 500 | `tracking-widest uppercase` |
| Card numbers | `text-xs sm:text-sm` | 400 | `font-mono text-primary/50 tracking-widest` |
| Button text | `text-sm sm:text-base` | 500 | |

---

## Root Container (REQUIRED on every page)

```tsx
<div className="bg-black text-gray-400 min-h-screen selection:bg-[#DEDBC8] selection:text-black overflow-x-hidden antialiased">
```

---

## Animation System (EXACT CONFIGS)

All animations use **framer-motion** (import from `motion/react`).

### WordsPullUp — per-word stagger

```tsx
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } }
};
const wordVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }
};
// useInView(ref, { once: true, margin: "-10% 0px -10% 0px" })
// animate={isInView ? "visible" : "hidden"}
```

### Card Grid — staggered scale-up

```tsx
const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } }
};
const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }
};
// useInView(gridRef, { once: true, margin: "-100px" })
```

### Fade-up (description + button)

```tsx
const descVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.5 } }
};
const btnVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.7 } }
};
```

### ScrollRevealParagraph — per-character scroll opacity

```tsx
// useScroll({ target: containerRef, offset: ['start 0.8', 'end 0.2'] })
// opacity = useTransform(scrollYProgress, [charProgress - 0.1, charProgress + 0.05], [0.2, 1])
// clamp ranges: startRange = Math.max(0, ...), endRange = Math.min(1, ...)
```

---

## Components (EXACT PATTERNS)

### Navbar Pill

```tsx
<nav className="absolute top-0 left-1/2 -translate-x-1/2 bg-black rounded-b-2xl md:rounded-b-3xl px-4 py-3 md:px-8 z-50 shadow-xl border-b border-white/5">
  <ul className="flex items-center gap-3 sm:gap-6 md:gap-12 lg:gap-14 whitespace-nowrap">
    {navItems.map((item, idx) => (
      <li key={idx}>
        <a
          style={{ color: hovered === idx ? '#E1E0CC' : 'rgba(225, 224, 204, 0.8)', transition: 'color 0.3s ease' }}
          onMouseEnter={() => setHovered(idx)}
          onMouseLeave={() => setHovered(null)}
          className="font-medium text-[10px] sm:text-xs md:text-sm tracking-widest uppercase select-none"
        >
          {item}
        </a>
      </li>
    ))}
  </ul>
</nav>
```

### CTA Button — "Join the app" → navigates to `/dashboard`

```tsx
<Link href="/dashboard">
  <button className="group flex items-center gap-2 bg-[#DEDBC8] hover:gap-3 text-black font-medium text-sm sm:text-base pl-6 pr-2 py-2 rounded-full shadow-lg transition-all duration-300 cursor-pointer">
    <span className="select-none">Join the app</span>
    <span className="bg-black rounded-full w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-all duration-300 group-hover:scale-110">
      <ArrowRight className="w-4 h-4 text-primary" />
    </span>
  </button>
</Link>
```

### Feature Card (icon + number + checklist + learn more)

```tsx
<motion.div
  variants={cardVariants}
  className="relative overflow-hidden rounded-2xl sm:rounded-3xl h-[380px] md:h-auto lg:h-full flex flex-col justify-between p-6 sm:p-8 bg-[#212121] border border-white/5 shadow-2xl group"
>
  {/* Top: Icon + Number */}
  <div className="flex justify-between items-start w-full">
    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded border border-white/10 shadow-lg bg-[#101010] flex items-center justify-center">
      {/* icon */}
    </div>
    <span className="text-xs sm:text-sm font-mono text-primary/50 tracking-widest font-normal">01</span>
  </div>

  {/* Center: Title + Checklist */}
  <div className="flex flex-col gap-4 my-4 flex-grow justify-center text-left">
    <h3 style={{ color: '#E1E0CC' }} className="text-base sm:text-lg font-semibold tracking-tight">
      Card Title.
    </h3>
    <ul className="flex flex-col gap-2 p-0 m-0">
      {items.map((item, idx) => (
        <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-gray-400 list-none">
          <Check className="w-4 h-4 text-[#DEDBC8] shrink-0 mt-0.5" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  </div>

  {/* Bottom: Learn more */}
  <div className="flex items-center">
    <a className="inline-flex items-center gap-1.5 text-xs text-primary/80 hover:text-primary font-medium tracking-wide transition-all duration-300 group-hover:gap-2.5">
      <span>Learn more</span>
      <ArrowRight className="w-3.5 h-3.5 transform -rotate-45 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </a>
  </div>
</motion.div>
```

### Video Card (first card in feature grid)

```tsx
<motion.div
  variants={cardVariants}
  className="relative overflow-hidden rounded-2xl sm:rounded-3xl h-[380px] md:h-auto lg:h-full flex flex-col justify-end p-6 sm:p-8 bg-[#212121] border border-white/5 shadow-2xl group"
>
  <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
  <p style={{ color: '#E1E0CC' }} className="font-semibold text-lg sm:text-xl z-10 select-none tracking-tight text-left">
    Caption text.
  </p>
</motion.div>
```

### About Card

```tsx
<div className="bg-[#101010] rounded-[2rem] p-8 sm:p-12 md:p-16 lg:p-20 text-center max-w-6xl mx-auto relative overflow-hidden shadow-2xl border border-white/5">
  <span className="text-primary text-[10px] sm:text-xs tracking-[0.2em] uppercase font-semibold mb-8 block">
    Tag Label
  </span>
  {/* Heading: WordsPullUpMultiStyle */}
  {/* Body: ScrollRevealParagraph */}
</div>
```

### Hero Section (full pattern)

```tsx
<section className="h-screen w-full p-4 md:p-6 bg-black relative">
  <div className="relative w-full h-full rounded-2xl md:rounded-[2rem] overflow-hidden bg-[#0A0A0A]">
    <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
    <div className="absolute inset-0 noise-overlay opacity-[0.7] mix-blend-overlay pointer-events-none" />
    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 pointer-events-none" />
    {/* Navbar */}
    <nav className="absolute top-0 left-1/2 -translate-x-1/2 ...">...</nav>
    {/* Content — bottom-aligned */}
    <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 md:p-12 z-20">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-end w-full">
        <div className="col-span-12 md:col-span-8">
          {/* Giant animated title */}
        </div>
        <div className="col-span-12 md:col-span-4 flex flex-col gap-6 items-start self-end">
          {/* Description + CTA button */}
        </div>
      </div>
    </div>
  </div>
</section>
```

### Status Badges (FactorFlow)

```tsx
// All: bg-[#212121] rounded-full px-3 py-1 text-xs font-medium
const STATUS_COLORS = {
  funded:    "text-[#DEDBC8]",
  due_soon:  "text-[#FFA500]",
  defaulted: "text-[#FF0000]",
  paid:      "text-[#008000]",
  pending:   "text-gray-400",
};
```

### Form Inputs (Dashboard)

```tsx
<input className="bg-[#101010] text-[#E1E0CC] rounded-xl border border-white/10 px-4 py-3 text-sm focus:border-primary/40 outline-none transition-colors placeholder:text-gray-600" />
```

### Tables

```
Header:  bg-[#101010] text-primary/70 text-[10px] uppercase tracking-widest
Row:     bg-black text-[#E1E0CC] text-sm border-b border-white/[0.06]
Alt row: bg-[#0A0A0A]
Numbers: font-bold text-[#DEDBC8]
```

---

## Layout

### Feature Card Grid

```tsx
<motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 lg:h-[480px] gap-3 sm:gap-2 md:gap-1 max-w-7xl mx-auto mt-16 w-full">
```

### Section Padding

| Section | Padding |
|---|---|
| Hero wrapper | `p-4 md:p-6` |
| About / Features | `py-24 px-4 sm:px-6 lg:px-8` |
| About card inner | `p-8 sm:p-12 md:p-16 lg:p-20` |
| Feature / dashboard cards | `p-6 sm:p-8` |
| Bottom hero content | `p-6 sm:p-8 md:p-12` |

### Container Widths

| Use | Class |
|---|---|
| Feature grid | `max-w-7xl mx-auto` |
| About card | `max-w-6xl mx-auto` |
| Section heading | `max-w-3xl mx-auto` |
| Paragraph | `max-w-2xl mx-auto` |

---

## Page Structure

| Section | Background | Key Components |
|---|---|---|
| Hero | `bg-black` → inner `bg-[#0A0A0A]` + video | Navbar pill, animated title, CTA "Join the app" → `/dashboard` |
| About | `bg-black` → `bg-[#101010] rounded-[2rem]` | WordsPullUpMultiStyle heading, ScrollRevealParagraph |
| Features | `bg-black` + `.bg-noise opacity-[0.15]` | 4-card grid: 1 video card + 3 feature cards |
| Dashboard pages | `bg-black` | Tables, forms, status badges, cards |

---

## DO / DON'T

### ✅ DO
- `#000000` for ALL page and section backgrounds
- `#E1E0CC` / `#DEDBC8` for all primary text (inline style for headings, Tailwind `text-primary` for accents)
- `rounded-2xl`, `rounded-3xl`, `rounded-[2rem]`, `rounded-full` — always soft corners
- Almarai for all text; Instrument Serif italic (`font-serif italic`) for emotional/tagline copy only
- framer-motion `variants` pattern (containerVariants + childVariants + staggerChildren) for all entrance animations
- `.noise-overlay opacity-[0.7] mix-blend-overlay` on hero video
- `.bg-noise opacity-[0.15]` on features section background
- `bg-gradient-to-b from-black/30 via-transparent to-black/60` on hero video
- `border border-white/5` on all cards
- `shadow-2xl` on cards
- `selection:bg-[#DEDBC8] selection:text-black overflow-x-hidden antialiased` on root container
- `font-mono text-primary/50 tracking-widest` for card numbers (01, 02, 03)
- `group` + `group-hover:` for button/card hover states
- `tracking-widest uppercase` for nav items and section labels

### ❌ DON'T
- NO `#ffffff` or any white background anywhere
- NO blue, purple, or colored brand accents
- NO borders thicker than `border-white/5` for decoration
- NO `border-radius: 0` or sharp corners
- NO box-shadows in light colors
- NO gradient text
- NO Inter, Roboto, or system-ui as primary font
- NO static headings — all visible headings animate in
- NO `style={{ color: 'white' }}` — use `#E1E0CC` or `#DEDBC8`
- NO colored backgrounds on dashboard pages
