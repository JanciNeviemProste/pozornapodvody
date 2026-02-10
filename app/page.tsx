"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";

type AnalysisResult = {
  scamProbability: number;
  verdict: string;
  summary: string;
  warningSigns: string[];
  actionSteps: string[];
  confidenceNote: string;
};

type AnalyzeApiResponse = {
  result: AnalysisResult;
};

const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== "string") {
        reject(new Error("Nepodarilo sa načítať obrázok."));
        return;
      }
      const split = value.split(",");
      if (split.length < 2) {
        reject(new Error("Neplatný formát obrázka."));
        return;
      }
      resolve(split[1]);
    };
    reader.onerror = () => reject(new Error("Nepodarilo sa načítať obrázok."));
    reader.readAsDataURL(file);
  });
}

function probabilityTone(value: number): "low" | "medium" | "high" {
  if (value >= 70) {
    return "high";
  }
  if (value >= 40) {
    return "medium";
  }
  return "low";
}

export default function HomePage() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const probability = result?.scamProbability ?? 0;
  const tone = probabilityTone(probability);

  const probabilityLabel = useMemo(() => {
    if (!result) {
      return "Zatiaľ bez analýzy";
    }
    if (probability >= 70) {
      return "Vysoké riziko podvodu";
    }
    if (probability >= 40) {
      return "Stredné riziko, overte detaily";
    }
    return "Skôr nízke riziko";
  }, [probability, result]);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) {
      setFile(null);
      setFileName("");
      return;
    }

    if (!selected.type.startsWith("image/")) {
      setError("Nahrajte prosím obrázok (screenshot alebo fotku).");
      setFile(null);
      setFileName("");
      return;
    }

    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setError("Obrázok je príliš veľký. Maximum je 4 MB.");
      setFile(null);
      setFileName("");
      return;
    }

    setError("");
    setFile(selected);
    setFileName(selected.name);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    const cleanText = text.trim();
    if (!cleanText && !file) {
      setError("Zadajte text alebo nahrajte obrázok.");
      return;
    }

    setLoading(true);

    try {
      const payload: {
        text?: string;
        image?: { base64: string; mimeType: string; name: string };
      } = {};

      if (cleanText) {
        payload.text = cleanText;
      }

      if (file) {
        const base64 = await fileToBase64(file);
        payload.image = {
          base64,
          mimeType: file.type || "image/jpeg",
          name: file.name
        };
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const failed = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          failed?.error ?? "Analýza sa nepodarila. Skúste to prosím znova."
        );
      }

      const data = (await response.json()) as AnalyzeApiResponse;
      setResult(data.result);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Nastala neznáma chyba.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <section className="hero">
        <p className="badge">Kurz digitálnych seniorov</p>
        <h1>Strážca podvodov</h1>
        <p className="hero-subtitle">
          Nahrajte screenshot, fotku alebo vložte text. Aplikácia vyhodnotí
          riziko podvodu a povie vám, čo spraviť ďalej.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Vstup pre analýzu</h2>
          <form onSubmit={onSubmit} className="form">
            <label htmlFor="text-input" className="label">
              1) Vložte správu, e-mail alebo text (voliteľné)
            </label>
            <textarea
              id="text-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Príklad: Prišla mi SMS, že mám doplatiť clo a kliknúť na odkaz..."
              rows={8}
            />

            <label htmlFor="image-input" className="label">
              2) Nahrajte screenshot alebo fotku (voliteľné, max 4 MB)
            </label>
            <input
              id="image-input"
              type="file"
              accept="image/*"
              onChange={onFileChange}
            />

            <p className="file-name">
              {fileName ? `Nahrané: ${fileName}` : "Bez nahraného obrázka"}
            </p>

            <button type="submit" disabled={loading}>
              {loading ? "Prebieha analýza..." : "Analyzovať"}
            </button>
          </form>

          {error ? <p className="error">{error}</p> : null}
        </article>

        <article className={`card result result-${tone}`}>
          <h2>Výsledok</h2>

          {result ? (
            <>
              <p className="probability-label">{probabilityLabel}</p>
              <p className="probability-value">{probability}%</p>
              <div className="meter">
                <div
                  className="meter-fill"
                  style={{ width: `${Math.min(100, Math.max(0, probability))}%` }}
                />
              </div>

              <div className="result-block">
                <h3>Záver</h3>
                <p>{result.verdict}</p>
              </div>

              <div className="result-block">
                <h3>Prečo to môže byť podvod</h3>
                <p>{result.summary}</p>
              </div>

              <div className="result-block">
                <h3>Varovné znaky</h3>
                <ul>
                  {result.warningSigns.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="result-block">
                <h3>Čo spraviť teraz</h3>
                <ol>
                  {result.actionSteps.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </div>

              <p className="confidence-note">{result.confidenceNote}</p>
            </>
          ) : (
            <p className="placeholder">
              Po odoslaní vstupu sa tu zobrazí odhad rizika podvodu, percento a
              návod v slovenčine.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
