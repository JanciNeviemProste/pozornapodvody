# Strazca Podvodov (Next.js + Gemini)

Web aplikacia pre ucastnikov kurzu digitalnych seniorov.
Pouzivatel moze:

- vlozit text (SMS, e-mail, chat)
- nahrat screenshot alebo fotku
- dostat odhad rizika podvodu v %
- dostat navod v slovencine, ako sa bezpecne zachovat

## 1) Lokalne spustenie

```bash
npm install
npm run dev
```

Aplikacia pobezi na `http://localhost:3000`.

## 2) API kluc (free tier)

Pouzity je Google Gemini API (Google AI Studio), ktory ma free tier.

1. Vytvorte API key v Google AI Studio.
2. Skopirujte `.env.example` na `.env.local`.
3. Vyplnte:

```env
GEMINI_API_KEY=vas_kluc
GEMINI_MODEL=gemini-1.5-flash
```

## 3) Deploy na Vercel

1. Importujte repozitar do Vercel.
2. V Project Settings -> Environment Variables pridajte:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` (volitelne)
3. Deploy.

## Poznamky

- API route je v `app/api/analyze/route.ts`.
- UI je v `app/page.tsx`.
- App je navrhnuta mobil-first a dobre citatelna pre seniorov.
