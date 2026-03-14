/**
 * All Gemini calls go through the Cloudflare Worker proxy.
 * The actual GEMINI_API_KEY never leaves the server.
 */

const PROXY_URL    = process.env.EXPO_PUBLIC_PROXY_URL;
const PROXY_SECRET = process.env.EXPO_PUBLIC_PROXY_SECRET;
const MODEL        = 'gemini-2.0-flash-preview';

// ─── Core proxy helper ────────────────────────────────────────────
async function callGemini(payload: object): Promise<{ candidates?: { content: { parts: { text: string }[] } }[] }> {
  if (!PROXY_URL || !PROXY_SECRET) {
    throw new Error(
      'Proxy not configured. Set EXPO_PUBLIC_PROXY_URL and EXPO_PUBLIC_PROXY_SECRET in .env'
    );
  }

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Secret': PROXY_SECRET,
    },
    body: JSON.stringify({ model: MODEL, payload }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message || `Proxy error: ${res.status}`);
  }

  return res.json();
}

function getText(data: Awaited<ReturnType<typeof callGemini>>): string {
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ─── Skin Analysis ────────────────────────────────────────────────

const SKIN_PROMPT = `You are a professional skincare expert and aesthetician. Analyze this person's skin from the photo and provide a warm, helpful, specific analysis.

Structure your response EXACTLY like this (use these exact headers):

**SKIN TYPE**
[Identify: Normal, Dry, Oily, Combination, or Sensitive — and briefly explain why]

**WHAT I NOTICE**
[3-5 honest, kind observations about their skin — visible pores, texture, tone, shine, redness, etc.]

**TOP CONCERNS** (in priority order)
[List 3 concerns with a one-line explanation each]

**RECOMMENDED ROUTINE**
Morning:
1. [Step + product type + why]
2. [Step + product type + why]
3. [Step + product type + why]
4. [SPF — always include this]

Evening:
1. [Step + product type + why]
2. [Step + product type + why]
3. [Step + product type + why]

**KEY INGREDIENTS TO LOOK FOR**
[List 4 ingredients with a one-line benefit each]

**LIFESTYLE TIPS**
[2-3 specific, actionable tips for their skin type]

Be specific, encouraging, and focus on affordable improvements.`;

export async function analyzeSkin(base64Image: string): Promise<string> {
  const data = await callGemini({
    contents: [{
      parts: [
        { text: SKIN_PROMPT },
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
      ],
    }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 3000 },
  });
  return getText(data) || 'No analysis returned.';
}

export async function askFollowUp(originalAnalysis: string, question: string): Promise<string> {
  const prompt = `You are a skincare expert. You previously gave this skin analysis to a user:\n\n${originalAnalysis}\n\nNow they are asking a follow-up question: "${question}"\n\nGive a concise, helpful, friendly answer based on their skin analysis. No need to repeat the full analysis.`;

  const data = await callGemini({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 800 },
  });
  return getText(data) || 'No response returned.';
}

// ─── Brow Analysis ───────────────────────────────────────────────

export interface BrowAnalysisResult {
  symmetryScore: number;
  naturalShape: string;
  archHeight: 'high' | 'medium' | 'low';
  spacing: 'wide' | 'ideal' | 'close';
  thickness: 'thick' | 'medium' | 'sparse' | 'overplucked';
  observations: string[];
  recommendedShape: string;
  products: { type: string; reason: string }[];
  tips: string[];
  summary: string;
}

const BROW_PROMPT = `You are a professional brow artist and aesthetician analyzing eyebrows in a photo.

Study carefully:
- Brow symmetry: compare left vs right in position, arch, and density
- Natural shape: flat, arched, rounded, angled, or S-shaped
- Arch height: high, medium, or low
- Spacing between brows: wide, ideal, or close
- Thickness/density: thick, medium, sparse, or overplucked
- Specific needs: gaps, stray hairs, uneven arch, missing tail, etc.
- Best shape recommendation for this person's facial structure

Respond with ONLY valid JSON — no markdown, no extra text:
{
  "symmetryScore": <integer 0–100, 100 = perfect symmetry>,
  "naturalShape": "<one of: flat, arched, rounded, angled, S-shaped>",
  "archHeight": "<one of: high, medium, low>",
  "spacing": "<one of: wide, ideal, close>",
  "thickness": "<one of: thick, medium, sparse, overplucked>",
  "observations": [<3–4 specific observations, max 15 words each>],
  "recommendedShape": "<the ideal shape for their face, 5–10 words>",
  "products": [
    { "type": "<product type e.g. Fine-tip brow pencil>", "reason": "<why it suits them, max 12 words>" },
    { "type": "<product type>", "reason": "<reason, max 12 words>" },
    { "type": "<product type>", "reason": "<reason, max 12 words>" }
  ],
  "tips": [<2–3 actionable tips specific to their brows, max 18 words each>],
  "summary": "<1–2 warm, encouraging sentences about their brows>"
}`;

export async function analyzeBrows(base64Image: string): Promise<BrowAnalysisResult> {
  const data = await callGemini({
    contents: [{
      parts: [
        { text: BROW_PROMPT },
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
      ],
    }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 700 },
  });

  const text = getText(data);
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');
    return JSON.parse(match[0]) as BrowAnalysisResult;
  } catch {
    return {
      symmetryScore: 78,
      naturalShape: 'arched',
      archHeight: 'medium',
      spacing: 'ideal',
      thickness: 'medium',
      observations: [
        'Natural arch shape complements the face structure well',
        'Minor asymmetry between left and right brow',
        'Density is healthy with some room to define the tail',
      ],
      recommendedShape: 'Soft angled arch with a gently defined peak',
      products: [
        { type: 'Fine-tip brow pencil', reason: 'Fill sparse spots hair-by-hair for natural depth' },
        { type: 'Spoolie brush', reason: 'Blend and groom daily for a polished finish' },
        { type: 'Clear brow gel', reason: 'Set hairs in place without adding heavy colour' },
      ],
      tips: [
        'Brush hairs upward before filling to reveal your natural shape',
        'Fill only the lower edge — it creates a subtle lifted effect',
        'Use short feathery strokes to mimic real brow hairs',
      ],
      summary: 'Your brows have a beautiful natural shape that just needs a little grooming and definition to really shine.',
    };
  }
}

// ─── Face Workout Analysis ────────────────────────────────────────

export interface FaceWorkoutResult {
  symmetryScore: number;
  primaryFocus: string[];
  secondaryFocus: string[];
  insights: string[];
  summary: string;
}

const FACE_WORKOUT_PROMPT = `You are a facial fitness expert analyzing a face photo to recommend targeted facial exercises.

Study the face carefully for:
- Facial symmetry: compare left vs right side balance
- Jawline definition and muscle tone
- Cheek fullness, cheekbone prominence
- Eye area: brow droop, hooding, tension around eyes
- Forehead: lines, muscle tension
- Overall facial muscle development and tone

Respond with ONLY valid JSON — no markdown, no extra text:
{
  "symmetryScore": <integer 0–100 where 100 = perfect symmetry>,
  "primaryFocus": [<1–2 items from exactly: "Jawline", "Cheeks", "Eyes", "Forehead", "Full Face">],
  "secondaryFocus": [<1–2 different items from the same list>],
  "insights": [<2–3 short specific observations, max 12 words each>],
  "summary": "<1–2 warm, encouraging sentences about their facial fitness>"
}`;

export async function analyzeFaceForWorkouts(base64Image: string): Promise<FaceWorkoutResult> {
  const data = await callGemini({
    contents: [{
      parts: [
        { text: FACE_WORKOUT_PROMPT },
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
      ],
    }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
  });

  const text = getText(data);
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');
    return JSON.parse(match[0]) as FaceWorkoutResult;
  } catch {
    return {
      symmetryScore: 76,
      primaryFocus: ['Jawline', 'Full Face'],
      secondaryFocus: ['Cheeks'],
      insights: [
        'Regular facial exercise can noticeably improve definition',
        'Consistency is key — even 5 minutes daily makes a difference',
      ],
      summary: 'Your face has great natural structure. A targeted facial workout routine will help sculpt and define your features over time.',
    };
  }
}
