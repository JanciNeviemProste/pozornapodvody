import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type AnalyzeRequestBody = {
  text?: string;
  image?: {
    base64?: string;
    mimeType?: string;
    name?: string;
  };
};

type NormalizedResult = {
  scamProbability: number;
  verdict: string;
  summary: string;
  warningSigns: string[];
  actionSteps: string[];
  confidenceNote: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cleanJsonText(raw: string): string {
  const withoutFence = raw.replace(/```json|```/gi, "").trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return withoutFence;
  }
  return withoutFence.slice(start, end + 1);
}

function asString(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const normalized = value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);

  return normalized.length ? normalized : fallback;
}

function normalizeModelResult(parsed: Record<string, unknown>): NormalizedResult {
  const rawProbability =
    (parsed.scamProbability as number | undefined) ??
    (parsed.scam_probability as number | undefined) ??
    50;

  const numericProbability = Number(rawProbability);
  const scamProbability = Number.isFinite(numericProbability)
    ? clamp(Math.round(numericProbability), 0, 100)
    : 50;

  const defaultVerdict =
    scamProbability >= 70
      ? "Pravdepodobne ide o podvod."
      : scamProbability >= 40
        ? "Riziko je stredné, situáciu si overte."
        : "Nevyzerá to ako jasný podvod, ale buďte opatrní.";

  return {
    scamProbability,
    verdict: asString(parsed.verdict, defaultVerdict),
    summary: asString(
      parsed.summary,
      "Nie je dosť údajov na jednoznačný záver. Overte si odosielateľa a doménu."
    ),
    warningSigns: asStringArray(parsed.warningSigns, [
      "Tlak na rýchle rozhodnutie alebo okamžitú platbu.",
      "Neštandardný odkaz, neznáma doména alebo preklepy.",
      "Žiadosť o citlivé údaje (heslo, karta, SMS kód)."
    ]),
    actionSteps: asStringArray(parsed.actionSteps, [
      "Neklikajte na odkaz ani neotvárajte prílohy.",
      "Overte si správu cez oficiálny web alebo telefónne číslo.",
      "Nikomu neposielajte heslá, PIN ani kódy z SMS.",
      "Ak ste už zaplatili, kontaktujte banku a požiadajte o blokáciu.",
      "Nahláste podvod polícii alebo na stránke hoax.sk."
    ]),
    confidenceNote: asString(
      parsed.confidenceNote,
      "AI odhad nemusí byť 100 % presný. Pri vyššom riziku konajte opatrne."
    )
  };
}

function extractCandidateText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return "";
  }

  const firstCandidate = candidates[0] as {
    content?: { parts?: Array<{ text?: unknown }> };
  };

  const parts = firstCandidate?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

function buildPrompt(text: string, imageName?: string): string {
  return `
Si bezpečnostný asistent pre kurz digitálnych seniorov na Slovensku.
Posúď, či vstup vyzerá ako online podvod (phishing, falošná platba, vydieranie, investičný scam, falošná podpora, falošná súťaž, kuriérsky podvod).

Vráť IBA čistý JSON bez markdownu.
Formát JSON:
{
  "scamProbability": number, // 0-100
  "verdict": "krátky záver v slovenčine",
  "summary": "stručné vysvetlenie pre seniora",
  "warningSigns": ["max 5 bodov, stručné"],
  "actionSteps": ["max 6 krokov, praktické kroky v slovenčine"],
  "confidenceNote": "jedna veta o neistote"
}

Pravidlá:
- Buď konzervatívny: ak si nie si istý, zvyš riziko radšej na stredné.
- Ak chýba časť dát, povedz to cez confidenceNote.
- Nepíš odborný žargón, píš jednoducho a zrozumiteľne.
- V actionSteps uprednostni bezpečné kroky (nekonať v panike, overiť odosielateľa, kontaktovať banku/políciu).

Vstup používateľa:
- Text: ${text || "(bez textu)"}
- Názov obrázka: ${imageName || "(bez obrázka)"}
`.trim();
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Chýba GEMINI_API_KEY. Nastavte ju vo Vercel/ENV a skúste znova."
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as AnalyzeRequestBody;
    const text = (body.text ?? "").trim().slice(0, 6000);
    const imageBase64 = body.image?.base64?.trim();
    const imageMimeCandidate = body.image?.mimeType?.trim();
    const imageMimeType =
      imageMimeCandidate && imageMimeCandidate.startsWith("image/")
        ? imageMimeCandidate
        : "image/jpeg";
    const imageName = body.image?.name?.trim();

    if (!text && !imageBase64) {
      return NextResponse.json(
        { error: "Pošlite text alebo obrázok na analýzu." },
        { status: 400 }
      );
    }

    const parts: Array<Record<string, unknown>> = [
      { text: buildPrompt(text, imageName) }
    ];

    if (imageBase64) {
      parts.push({
        inline_data: {
          mime_type: imageMimeType,
          data: imageBase64
        }
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    let geminiResponse: Response;
    try {
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts
              }
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json"
            }
          }),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const geminiPayload = (await geminiResponse.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!geminiResponse.ok) {
      const debugLine = `GEMINI_FAIL status=${geminiResponse.status} model=${model} body=${JSON.stringify(geminiPayload)}`;
      console.error(debugLine);
      return NextResponse.json(
        {
          error:
            "AI služba momentálne neodpovedá správne. Skúste to o chvíľu znova.",
          debug: debugLine
        },
        { status: 502 }
      );
    }

    const rawText = extractCandidateText(geminiPayload);
    const jsonText = cleanJsonText(rawText);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        {
          error:
            "Nepodarilo sa spracovať odpoveď AI. Skúste kratší text alebo iný obrázok."
        },
        { status: 502 }
      );
    }

    const result = normalizeModelResult(parsed);
    return NextResponse.json({ result }, { status: 200 });
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: isAbort
          ? "Analýza vypršala. Skúste to znova s menším obrázkom."
          : "Nastala interná chyba servera."
      },
      { status: 500 }
    );
  }
}
