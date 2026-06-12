# US Bank Account Termination Diagnostic System
### Business Ideology, Research Prompts & Architecture Brief
**Owner:** Sayem Abdullah Rihan (Founder & CEO — TechSci Inc, RoyalSoft LLC, CodeCraft Agency, Afilo, TaskCoda)
**Date Created:** 2026-04-11
**Status:** Ideation → Research Phase
**Future Sync Target:** Claude (Anthropic) — for architecture, codebase, and product build

---

## 1. THE CORE PROBLEM

Every year, thousands of US-based business bank accounts — both at **traditional banks** (Chase, Bank of America, Wells Fargo, Mercury, Relay, Rho, Brex, etc.) and **digital/neobanks** — are **abruptly terminated** with little or no explanation. This disproportionately impacts:

- **Non-resident alien (NRA) business owners** operating US-registered LLCs or C-Corps from abroad
- **Immigrant founders** whose international transaction patterns trigger compliance flags
- **High-risk MCC category businesses** (SaaS, fintech, crypto-adjacent, etc.)
- **Dormant or newly active entities** that suddenly show transaction volume

The affected business owner typically receives:
> *"We have decided to close your account. Please withdraw your funds within X days."*

No reason. No appeal path. No transparency.

---

## 2. THE SOLUTION CONCEPT

Build an **AI-powered diagnostic and intelligence system** that:

1. **Analyzes** the termination letter / notification received
2. **Maps** the language patterns to known bank policy triggers (BSA/AML, OFAC, Reg D, Patriot Act, etc.)
3. **Identifies** the most probable reason(s) behind the closure
4. **Generates** a structured appeal letter or regulatory inquiry
5. **Recommends** alternative banking options based on the user's business profile
6. **Proactively scores** a business's banking risk before applying anywhere

### Working Product Names (TBD)
- **BankGuard AI**
- **AccountShield**
- **TerminAlert**
- **ClearAccount**

---

## 3. FOUNDER CONTEXT (For AI Sessions — Include This)

> This section must be included in every Perplexity or AI research session for context continuity.

**Founder:** Sayem Abdullah Rihan
**Location:** Dhaka, Bangladesh
**Entities:**
- TechSci Inc (Delaware C-Corp, EIN: 35-2800827) — Primary US entity
- RoyalSoft LLC — Software/SaaS operations
- CodeCraft Agency — Development agency
- Afilo (afilo.io) — SaaS product
- TaskCoda (taskcoda.com) — Task/project management SaaS

**Banking Tools Used:** Mercury, Rho Bank, Relay, Wise, Payoneer, Melio, Polar.sh, Stripe
**Known Pain Points:**
- Payoneer account closure dispute (appealed formally)
- NSave (Masref Ltd/npay Inc.) investigated as suspicious fund platform
- Mercury/Rho/Relay banking applications for family entity (A N Green Solution LLC, FL)
- Non-resident banking compliance challenges as Bangladesh-based US business owner

**Dev Stack:** Next.js 15, Bun, Tailwind CSS v4, Prisma, PostgreSQL, NextAuth v5, Vercel, Hetzner, GitHub
**AI Tools in Use:** Claude Code (Anthropic), Perplexity, DeepSeek

---

## 4. RESEARCH PROMPTS FOR PERPLEXITY

Use each prompt as a **separate Perplexity Deep Research session**. Copy-paste directly.

---

### PROMPT 1 — Regulatory & Legal Framework Research

```
I am building an AI-powered SaaS tool that helps business owners understand why their US bank account was terminated (closed without explanation).

Please research and provide a comprehensive breakdown of:

1. The US regulatory frameworks that give banks the right to terminate accounts without explanation (Bank Secrecy Act, USA PATRIOT Act Section 326, FinCEN SAR rules, OFAC compliance, etc.)
2. What "de-risking" means in US banking and which business categories are most affected
3. The legal concept of "at-will" account termination — what protections (if any) exist for business account holders
4. Whether there are any CFPB, OCC, or FDIC regulations that require banks to disclose reasons for account closure
5. Recent regulatory changes (2022–2026) that affect account termination practices
6. Any state-level laws (especially Delaware, Wyoming, Florida) that give businesses more rights around account closure notices

Format: Structured report with sources. Include regulatory citation numbers where available.
```

---

### PROMPT 2 — Bank Policy Intelligence Research

```
I am building a tool that maps account termination language to probable bank policy triggers.

Please research:

1. The most common documented reasons US banks terminate business accounts (with sources/case studies):
   - Suspicious transaction patterns (AML flags)
   - OFAC-linked geography (international wire patterns)
   - High-risk MCC codes (crypto, SaaS, adult, firearms, etc.)
   - Dormant account sudden activity
   - Identity verification failures (KYC/KYB failure)
   - Chargeback ratios
   - Fraud score thresholds
   - Non-resident alien (NRA) ownership flags
   - Politically Exposed Persons (PEP) proximity

2. Specific documented cases where neobanks (Mercury, Relay, Brex, Rho, Bluevine, Novo, Found) terminated accounts and what triggered it

3. What language/phrases typically appear in termination letters and what they signal

4. Known internal bank risk scoring systems (ChexSystems, EWS — Early Warning Services, Mastercard MATCH list) — how do these work and how do they affect a closed account holder?

Format: Structured with bank-by-bank notes where available. Include any Reddit, Twitter/X, or Hacker News documented cases.
```

---

### PROMPT 3 — Competitive Landscape & Market Research

```
I want to build a SaaS product that helps US business owners (especially non-resident alien founders and immigrant entrepreneurs) diagnose why their US bank account was terminated and find alternative banking.

Please research:

1. Does any product currently exist that does this? (Search thoroughly — startups, tools, law firm portals, fintech tools)
2. What adjacent products exist:
   - Banking risk assessment tools
   - AML compliance SaaS for SMBs
   - Account closure appeal letter generators
   - Alternative banking directory/matchmakers for high-risk businesses
3. What law firms or consultants currently serve this niche?
4. Estimated market size: How many US business account closures happen annually? What % involve non-resident owners?
5. What are the top communities where affected founders discuss this? (Reddit, Facebook groups, forums)

Format: Competitive matrix + market size estimate + community sources.
```

---

### PROMPT 4 — Technical Architecture Research

```
I want to build an AI-powered web application with the following core features:

1. User uploads or pastes their bank account termination letter
2. AI analyzes the letter and maps language patterns to known regulatory/policy triggers
3. System outputs: probable reason(s), confidence score, regulatory basis, recommended actions
4. Appeal letter generator (customizable, formal)
5. Alternative bank matcher based on: business type, MCC code, owner nationality, transaction volume
6. Proactive risk scoring — user inputs their business profile, system outputs a banking risk score before they apply

Please research and recommend:

1. Best AI/LLM approach for document classification and intent extraction (fine-tuned model vs RAG vs prompt engineering)
2. Data sources to build the knowledge base (regulatory docs, bank terms of service, FinCEN guidance, community-sourced cases)
3. Best tech stack for this as a Next.js / Node.js / PostgreSQL SaaS product
4. How to structure the RAG knowledge base for bank policy documents
5. Any open datasets related to bank account closures, de-risking reports, or BSA/AML enforcement actions

Format: Technical architecture recommendations with reasoning.
```

---

### PROMPT 5 — GTM & Monetization Strategy

```
I am building "BankGuard AI" (working name) — a SaaS tool for US business owners (especially non-resident alien founders, immigrant entrepreneurs, and high-risk business categories) that diagnoses why their bank account was terminated and helps them recover.

Please research and recommend:

1. Go-to-market strategy:
   - Which communities to target first (immigrant founder networks, NRA business owner groups, specific industries)
   - Key distribution channels (SEO keywords, Reddit, LinkedIn, niche forums)
   - Partnership opportunities (immigration lawyers, US company formation services like Stripe Atlas, Doola, Firstbase, Northwest Registered Agent)

2. Pricing model:
   - Freemium tiers vs one-time payment vs subscription
   - Comparable SaaS pricing in legal-adjacent fintech tools

3. Content marketing angle:
   - What search queries do affected founders make? (e.g., "Mercury bank closed my account", "why did Chase close my LLC account")
   - Blog content strategy

4. Compliance/legal considerations for operating this service as a non-US-resident founder

Format: Full GTM brief with prioritized action items.
```

---

## 5. SYSTEM ARCHITECTURE OUTLINE (Draft)

> To be refined with Claude after Perplexity research is complete.

```
┌─────────────────────────────────────────────────────┐
│                   BankGuard AI                      │
├─────────────────────────────────────────────────────┤
│  INPUT LAYER                                        │
│  - Upload termination letter (PDF/image/text)       │
│  - Manual input form (bank name, date, account type)│
│  - Business profile intake (MCC, NRA status, etc.)  │
├─────────────────────────────────────────────────────┤
│  ANALYSIS ENGINE                                    │
│  - OCR / document parser                           │
│  - LLM classification (RAG-based)                  │
│  - Policy trigger mapper                           │
│  - Confidence scoring                              │
├─────────────────────────────────────────────────────┤
│  KNOWLEDGE BASE                                     │
│  - Bank terms of service corpus                    │
│  - FinCEN / BSA / OFAC regulatory docs             │
│  - Community-sourced termination cases             │
│  - ChexSystems / EWS behavior patterns             │
├─────────────────────────────────────────────────────┤
│  OUTPUT LAYER                                       │
│  - Diagnosis report (reason + confidence + basis)  │
│  - Appeal letter generator                         │
│  - Alternative bank recommendations                │
│  - Proactive risk score dashboard                  │
├─────────────────────────────────────────────────────┤
│  TECH STACK (Planned)                               │
│  - Frontend: Next.js 15, Tailwind CSS v4           │
│  - Backend: Node.js / Bun, Prisma, PostgreSQL      │
│  - Auth: NextAuth v5                               │
│  - AI: Anthropic Claude API (primary)              │
│  - File handling: PDF.js / Tesseract OCR           │
│  - Hosting: Vercel (frontend) + Hetzner (backend)  │
└─────────────────────────────────────────────────────┘
```

---

## 6. ENTITY & OWNERSHIP STRUCTURE (For Product Build)

| Decision | Option |
|---|---|
| **Product Owner Entity** | TechSci Inc (Delaware C-Corp) — preferred for US credibility |
| **Fallback Entity** | RoyalSoft LLC |
| **Revenue Processing** | Stripe or Polar.sh |
| **Banking for Product Revenue** | Mercury or Rho (existing relationships) |

---

## 7. NEXT STEPS AFTER PERPLEXITY RESEARCH

1. Complete all 5 Perplexity research prompts → save outputs
2. Compile findings into a **Master Research Document**
3. Return to Claude with compiled research for:
   - Finalizing system architecture
   - Database schema design
   - Knowledge base structuring strategy
   - MVP feature scope and sprint planning
   - Codebase initialization (Next.js 15 + Bun + Prisma)

---

## 8. CLAUDE SYNC INSTRUCTIONS (For Future Sessions)

When returning to Claude with this document, use this opening prompt:

```
I previously ideated a product called "BankGuard AI" — an AI diagnostic tool for US bank account terminations. I've completed Perplexity research across 5 areas (regulatory framework, bank policy intelligence, competitive landscape, technical architecture, and GTM strategy).

Here is my original brief: [paste this document]
Here are my Perplexity research findings: [paste findings]

I am Sayem Abdullah Rihan — Founder of TechSci Inc (Delaware C-Corp), non-resident business owner based in Dhaka, Bangladesh. My dev stack is Next.js 15, Bun, Tailwind CSS v4, Prisma, PostgreSQL, NextAuth v5.

Please help me: [state your next specific goal — architecture finalization / DB schema / MVP scope / codebase init]
```

---

*Document version: 1.0 | Created: 2026-04-11 | Owner: Sayem Abdullah Rihan*
*Next sync target: Claude (Anthropic) after Perplexity research phase completion*
