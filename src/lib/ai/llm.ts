// ─────────────────────────────────────────────────────────────
// llm.ts — AI Script Generation Engine
// Updated: bilingual support, auto Hindi for Indian subjects,
//          chain-of-thought visual prompts, biographical framework,
//          word count enforcement, prompt sanitization
// ─────────────────────────────────────────────────────────────

export interface GeneratedScript {
    title: string;
    script: string;
    subject?: string;
    scenes: {
        headline: string;
        narrationText: string;
        visualPrompt: string;
        durationInSeconds: number;
    }[];
}

// ─────────────────────────────────────────────────────────────
// SANITIZATION — strip Hindi, emoji, pipes from image prompts
// ─────────────────────────────────────────────────────────────
function sanitizeVisualPrompt(prompt: string): string {
    return prompt
        .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')   // remove emoji
        .replace(/[\u0900-\u097F]+/g, '')           // remove Devanagari/Hindi
        .replace(/^[^|]*\|/, '')                    // remove "title | prompt" pattern
        .replace(/,\s*,/g, ',')                     // clean double commas
        .replace(/^\s*,\s*/, '')                    // clean leading comma
        .trim();
}

// ─────────────────────────────────────────────────────────────
// AUTO LANGUAGE DETECTION — force Hindi for Indian subjects
// ─────────────────────────────────────────────────────────────
const INDIAN_SUBJECT_KEYWORDS = [
    'shivaji', 'prithviraj', 'ashoka', 'chanakya', 'maharana', 'pratap',
    'akbar', 'aurangzeb', 'tipu', 'bajirao', 'peshwa', 'rana', 'maharaj',
    'vivekananda', 'gandhi', 'ambedkar', 'bose', 'bhagat', 'patel',
    'chandragupta', 'samrat', 'mughal', 'maratha', 'rajput', 'maurya',
    'vikramaditya', 'harsha', 'krishnadevaraya', 'rani', 'lakshmibai',
    'subhash', 'nehru', 'tilak', 'gokhale', 'savarkar', 'rana sanga',
    'rana kumbha', 'hemu', 'dara', 'ranjit', 'guru gobind', 'banda',
    'shahu', 'balaji', 'nana', 'tantya', 'mangal pandey', 'bhim'
];

function resolveLanguage(subject: string, requestedLanguage: string): string {
    const subjectLower = subject.toLowerCase();
    const isIndian = INDIAN_SUBJECT_KEYWORDS.some(k => subjectLower.includes(k));
    if (isIndian && requestedLanguage === 'english') {
        console.log(`[LLM] Auto-switching to Hindi for Indian subject: ${subject}`);
        return 'hindi';
    }
    return requestedLanguage;
}

// ─────────────────────────────────────────────────────────────
// ART STYLES
// ─────────────────────────────────────────────────────────────
const ART_STYLE_PROMPTS: Record<string, string> = {
    watercolor_illustration: "watercolor illustration, soft painterly washes, muted palette, loose brushstrokes, single image, no text",
    comic: "bold comic book art, thick black outlines, flat vivid colors, single frame, no text",
    creepy_comic: "dark horror comic art, heavy ink shadows, distorted expressions, unsettling, single image, no text",
    modern_cartoon: "modern cartoon style, clean vector lines, vibrant saturated colors, expressive, single character, no text",
    disney: "Disney animation style, warm lighting, expressive eyes, cinematic composition, single character, no text",
    mythology: "Indian mythology painting, ornate temple art style, gold divine light, rich jewel tones, single scene, no text",
    pixel_art: "pixel art, 16-bit retro game style, limited palette, crisp pixels, individual character, no text",
    ghibli: "Studio Ghibli style, soft watercolor backgrounds, lush nature detail, warm gentle light, single frame, no text",
    anime: "anime illustration, detailed character art, dynamic pose, cinematic lighting, individual, no text",
    painting: "classical oil painting, rich textures, dramatic chiaroscuro, old master style, single scene, no text",
    dark_fantasy: "dark fantasy digital art, moody shadows, epic scale, dramatic atmosphere, single image, no text",
    lego: "LEGO minifigure style, plastic toy aesthetic, bright primary colors, blocky, single figure, no text",
    polaroid: "polaroid photo style, slightly faded, warm vintage grain, candid documentary feel, single shot, no text",
    realism: "photorealistic, 8K detail, cinematic photography, sharp focus, dramatic lighting, single scene, no text",
    fantastic: "fantastical illustration, magical realism, surreal dreamlike colors, epic, single frame, no text",
    cinematic_3d: "cinematic 3D render, volumetric lighting, ultra detailed, film quality, single individual, no text",
};

// ─────────────────────────────────────────────────────────────
// DURATION TARGETS
// ─────────────────────────────────────────────────────────────
/**
 * Narration speed used to turn a target duration into a word budget.
 *
 * Measured across six ElevenLabs runs: 2.43, 2.52, 2.53, 2.58, 2.77 and 2.81
 * words/second — the rate genuinely varies with the content, so no constant
 * hits the target exactly. 2.6 is the mean, which centres the error instead of
 * biasing every reel short.
 *
 * Expect roughly +/-10% on the finished audio. The budget deliberately does not
 * chase perfection: matching exactly would mean synthesising, measuring, and
 * regenerating, which costs a second TTS call on every reel.
 */
export const WORDS_PER_SECOND = 2.6;

/** Reels may run this much over target before the script is trimmed. */
const OVERRUN_TOLERANCE = 1.1;

export function getTargets(durationInSeconds: number) {
    const targetWords = Math.round(durationInSeconds * WORDS_PER_SECOND);

    // The previous bands ("130-150" and friends) were only ever read as a
    // minimum — the prompts took the lower bound and told the model to expand
    // if it was under. Nothing stated an upper bound, so a 60s reel routinely
    // came back at ~280 words and ran to 108s. The budget is now a range with
    // a real ceiling, and enforceWordBudget guarantees it.
    const minWords = Math.round(targetWords * 0.9);
    const maxWords = Math.round(targetWords * OVERRUN_TOLERANCE);

    if (durationInSeconds <= 60) {
        return {
            targetWords, minWords, maxWords,
            sceneCount: Math.max(8, Math.ceil(durationInSeconds / 6)),
            sceneDuration: 6,
            acts: 3,
            format: "9:16 portrait",
        };
    }
    if (durationInSeconds <= 180) {
        return {
            targetWords, minWords, maxWords,
            sceneCount: Math.ceil(durationInSeconds / 8),
            sceneDuration: 8,
            acts: 5,
            format: "1:16 landscape",
        };
    }
    return {
        targetWords, minWords, maxWords,
        sceneCount: Math.ceil(durationInSeconds / 12),
        sceneDuration: 12,
        acts: 7,
        format: "16:9 landscape",
    };
}

// ─────────────────────────────────────────────────────────────
// WORD BUDGET ENFORCEMENT
// ─────────────────────────────────────────────────────────────

export function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Splits on Latin terminators and the Devanagari danda. */
function splitSentences(text: string): string[] {
    return (text.match(/[^।.!?]+[।.!?]+|[^।.!?]+$/g) ?? [])
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * Brings a generated script within its word budget.
 *
 * Prompting alone does not hold — models overshoot word counts routinely — so
 * this is the guarantee.
 *
 * Every scene keeps its opening sentence, then remaining budget is handed out
 * round-robin, one sentence at a time, until the next sentence would not fit.
 * That keeps all the scenes (and so the visual arc and the ending) and spends
 * the whole budget, where trimming each scene proportionally left reels well
 * short of target whenever sentences were long.
 *
 * Cuts land on sentence boundaries — Latin terminators or the Devanagari danda
 * — so the voice never reads a fragment. `script` is rebuilt from the kept
 * sentences so the text sent to text-to-speech is exactly the text the scenes
 * are timed against.
 */
export function enforceWordBudget(result: GeneratedScript, maxWords: number): GeneratedScript {
    const scenes = result.scenes ?? [];
    if (scenes.length === 0 || maxWords <= 0) return result;

    const total = scenes.reduce((sum, s) => sum + countWords(s.narrationText || ""), 0);
    if (total <= maxWords) {
        // Within budget, but still normalise: models return a `script` that
        // does not quite match the scene narrations (152 vs 137 words in one
        // observed run). The script is what gets spoken while the scene word
        // counts decide where cuts land, so any drift between them slides the
        // cuts off the narration. Scenes win — narration with no scene has
        // nothing to show behind it.
        return { ...result, script: scenes.map((s) => s.narrationText).join(" ") };
    }

    console.warn(
        `[LLM] Script is ${total} words against a ${maxWords} budget (~${Math.round(total / WORDS_PER_SECOND)}s vs ~${Math.round(maxWords / WORDS_PER_SECOND)}s). Trimming.`,
    );

    const sentencesPerScene = scenes.map((s) => splitSentences(s.narrationText || ""));

    // Pass 1: one sentence each, so no scene is left without narration. This
    // can exceed the budget on its own; dropping a scene would cost an image
    // and a beat of the story, which is the worse trade.
    const kept = sentencesPerScene.map((sentences) => sentences.slice(0, 1));
    let used = kept.reduce((sum, s) => sum + countWords(s.join(" ")), 0);

    // Pass 2: round-robin the remainder so later scenes are not starved.
    let added = true;
    while (added) {
        added = false;
        for (let i = 0; i < scenes.length; i++) {
            const next = sentencesPerScene[i][kept[i].length];
            if (!next) continue;
            const words = countWords(next);
            if (used + words > maxWords) continue;
            kept[i].push(next);
            used += words;
            added = true;
        }
    }

    let texts = kept.map((sentences, i) => sentences.join(" ").trim() || scenes[i].narrationText || "");

    // Last resort. With many scenes and long opening sentences, pass 1 can
    // exceed the budget on its own — 25 scenes of ~25 words each came to 624
    // against a 495 cap, running 222s for a 180s target. Sentence boundaries
    // cannot help there, so the longest scenes are cut at a word boundary
    // instead. Only the worst offenders are touched, and never below a floor
    // that would leave a scene with a stub.
    used = texts.reduce((sum, t) => sum + countWords(t), 0);
    if (used > maxWords) {
        const perScene = Math.max(8, Math.floor(maxWords / scenes.length));
        console.warn(
            `[LLM] Sentence-level trim still leaves ${used} words; capping scenes at ${perScene} words each.`,
        );
        texts = texts.map((text) => {
            const words = text.split(/\s+/).filter(Boolean);
            return words.length <= perScene ? text : words.slice(0, perScene).join(" ");
        });
    }

    const trimmed = scenes.map((scene, i) => ({ ...scene, narrationText: texts[i] }));

    const after = trimmed.reduce((sum, s) => sum + countWords(s.narrationText), 0);
    console.log(`[LLM] Trimmed to ${after} words (~${Math.round(after / WORDS_PER_SECOND)}s).`);

    return {
        ...result,
        scenes: trimmed,
        script: trimmed.map((s) => s.narrationText).join(" "),
    };
}

// ─────────────────────────────────────────────────────────────
// CAMERA ANGLE ROTATION — forces scene variety
// ─────────────────────────────────────────────────────────────
const CAMERA_ANGLES = [
    "wide establishing shot, subject small against vast landscape",
    "medium shot, subject with surrounding figures or environment",
    "close-up portrait, face fills frame, raw emotion visible",
    "low angle heroic shot, subject towers against sky",
    "over-the-shoulder shot, looking at what subject sees",
    "aerial wide shot, epic scale, tiny figures in landscape",
    "extreme close-up, hands or eyes or symbolic detail",
    "medium wide shot, full body action pose, environment visible"
];

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────
export async function generateScriptWithAI(
    niche: string,
    language: string,
    durationInSeconds: number = 60,
    customScript?: string,
    artStyle: string = "watercolor_illustration",
    subject?: string,
    seriesContext?: string,
    visualStylePrompt?: string,
    visualStyleOverride?: string,
    usePremium: boolean = false
): Promise<GeneratedScript> {

    const { targetWords, minWords, maxWords, sceneCount, sceneDuration, format } = getTargets(durationInSeconds);
    const isCustom = !!customScript;
    const stylePrompt = ART_STYLE_PROMPTS[artStyle] || ART_STYLE_PROMPTS.watercolor_illustration;
    const resolvedSubject = subject || niche;

    // Auto-detect language for Indian subjects
    const effectiveLanguage = resolveLanguage(resolvedSubject, language);

    // Pre-compute trimmed style for use in prompts and enrichment
    const trimmedBase = stylePrompt.split(',').slice(0, 6).join(',');

    console.log(`[LLM] Subject: "${resolvedSubject}" | Lang: ${language}→${effectiveLanguage} | Duration: ${durationInSeconds}s | Scenes: ${sceneCount} | Words: ${minWords}-${maxWords} (target ${targetWords})`);

    // ─────────────────────────────────────────────────────────
    // VISUAL PROMPT RULES — injected into every LLM call
    // ─────────────────────────────────────────────────────────
    const VISUAL_PROMPT_RULES = `
═══════════════════════════════════════
VISUAL PROMPTS — CINEMATOGRAPHER RULES
═══════════════════════════════════════
You are the cinematographer. For EACH scene, silently answer these 5 questions
BEFORE writing the visualPrompt:

  Q1: What is LITERALLY happening physically in this narration RIGHT NOW?
      (not the theme — the specific action: "ship departing", "sword raised", "letter read")
  Q2: What is the EXACT named real-world location?
      (not "historical setting" — "Southampton harbor", "Haldighati pass", "Red Fort Delhi")
  Q3: What time of day and weather matches the emotional beat?
      (dawn mist, golden sunset, stormy night, bright morning, torchlight interior)
  Q4: What camera angle creates maximum impact AND differs from the PREVIOUS scene?
      (use this rotation: wide establishing → medium group → close-up portrait →
       low angle heroic → aerial wide → over-shoulder → extreme close-up → action shot)
  Q5: What ONE detail would make this image tell the story without any words?

THEN write the visualPrompt using those 5 answers.

EXAMPLE REASONING:
Narration: "10 अप्रैल 1912… Titanic अपनी पहली यात्रा पर निकला।"
  Q1: Massive ship leaving port for the first time
  Q2: Southampton harbor, England
  Q3: Bright morning, hopeful crowds, smoke from funnels
  Q4: Wide establishing (haven't used yet)
  Q5: Ship dwarfing the tiny people — shows scale of human ambition
→ visualPrompt: "RMS Titanic departing Southampton harbor April 1912,
   massive black hull towering over tiny cheering crowds on dock,
   bright morning light, smoke from four funnels, wide establishing shot,
   ${trimmedBase}, no text"

VISUAL PROMPT HARD RULES:
- English ONLY — zero Hindi characters, zero emoji, zero pipe symbols
- Max 250 characters total
- Single cohesive image — no collages, no panels, no split screens
- Must include: subject name + specific action + named location + camera angle + art style
- NEVER: "dramatic scene", "important moment", "historical setting", "ancient times"
- ALWAYS: specific named people, specific named places, specific physical action
`;

    // ─────────────────────────────────────────────────────────
    // BIOGRAPHICAL FRAMEWORK
    // ─────────────────────────────────────────────────────────
    const BIOGRAPHICAL_FRAMEWORK = `
═══════════════════════════════════════
MANDATORY STORY STRUCTURE
═══════════════════════════════════════
Cover ALL 6 beats IN ORDER. Each % = approximate word allocation:

1. HOOK (10%):
   - ONE shocking or counterintuitive fact about ${resolvedSubject}
   - Something most people don't know
   - NOT birth date, NOT "today we talk about", NOT "in this video"
   ${effectiveLanguage === 'hindi'
            ? '- Hindi example: "उसने एक ऐसा काम किया जो पूरी दुनिया असंभव समझती थी—"'
            : '- English example: "He defeated an army 10 times his size — with no gunpowder."'}

2. ORIGIN (15%):
   - Specific birthplace + family circumstances + early hardship
   - Real place name + real family situation
   - What made their beginning DIFFICULT or unusual

3. THE DEFINING CHALLENGE (25%):
   - The ONE central conflict: who or what opposed them
   - Why it seemed completely impossible to overcome
   - Named enemy / obstacle / circumstance

4. THE TURNING POINT (25%):
   - Specific named event: battle, speech, decision, discovery
   - Real date or year if known
   - What EXACTLY happened at this moment — the details matter

5. THE ACHIEVEMENT (15%):
   - Concrete, measurable result — not "they were great"
   - What specifically changed in the world because of them
   - Numbers, names, places if possible

6. THE LEGACY (10%):
   - Why they still matter TODAY to the viewer watching this
   - One emotional line connecting their story to modern life
   - The closer that makes the viewer feel something

CRITICAL: Use REAL names, dates, places from ${resolvedSubject}'s actual history.
Do not invent. If approximate, say "around 1200 CE" not a specific fake date.
`;

    // ─────────────────────────────────────────────────────────
    // SYSTEM PROMPTS
    // ─────────────────────────────────────────────────────────
    const SYSTEM_PROMPT_CUSTOM = `
You are a professional bilingual reel producer with TWO strictly separate jobs.

═══════════════════════════════════════
JOB 1 — NARRATION EDITOR (${effectiveLanguage})
═══════════════════════════════════════
- Take the PROVIDED SCRIPT and split it into exactly ${sceneCount} scenes
${effectiveLanguage === 'hindi'
  ? '- If the provided script is in Romanized Hinglish script (e.g. English alphabets expressing Hindi words like "Prithviraj Chauhan ek mahan yoddha..."), you MUST transcribe/convert it to pure DEVANAGARI HINDI characters (e.g. "पृथ्वीराज चौहान एक महान योद्धा...") for narrationText and the script field. This is absolutely critical so that ElevenLabs Hindi voiceover reads it correctly. If it is already in Devanagari, keep it exactly as is.'
  : '- narrationText = EXACT original words, not one word changed\n- Combined narrationText of ALL scenes = the COMPLETE original script'
}
- Each scene headline = 3-4 word ${effectiveLanguage} summary of that moment (strictly in pure DEVANAGARI HINDI script if Hindi)

JOB 2 — CINEMATOGRAPHER (English ONLY)
═══════════════════════════════════════
- For each scene, read the narrationText carefully
- Answer Q1-Q5 silently, THEN write the visualPrompt in English
- visualPrompt = English only, always, no exceptions

SUBJECT: ${resolvedSubject}
ART STYLE: ${artStyle}
${seriesContext ? `SERIES CONTEXT: ${seriesContext}` : ''}
${visualStylePrompt ? `SERIES VISUAL STYLE: ${visualStylePrompt}` : ''}
${visualStyleOverride ? `REEL VISUAL OVERRIDE: ${visualStyleOverride}` : ''}

${VISUAL_PROMPT_RULES}

CRITICAL LANGUAGE RULE:
narrationText → ${effectiveLanguage} ${effectiveLanguage === 'hindi' ? '(MUST be pure Devanagari Hindi characters only, no Roman script/Hinglish characters)' : '(exact original words, unchanged)'}
headline      → ${effectiveLanguage} ${effectiveLanguage === 'hindi' ? '(MUST be pure Devanagari Hindi characters)' : ''}
visualPrompt  → ENGLISH ONLY, always, max 250 characters

CORRECT bilingual example:
{
  "narrationText": "गेंगिस खान का जन्म 1162 में हुआ — एक गरीब खानाबदोश परिवार में।",
  "visualPrompt": "Genghis Khan as young boy age 9, poverty-stricken Mongolian nomad camp 1162, wide establishing shot child small against vast empty steppe, cold dawn light, ${trimmedBase}, no text"
}

WRONG — never do this:
{
  "visualPrompt": "गेंगिस खान युद्ध में, dramatic cinematic"
}

Return ONLY valid JSON. No markdown. No backticks. No explanation.
`;

    const SYSTEM_PROMPT_AI = `
You are a professional bilingual reel scriptwriter and cinematographer.
You write high-retention biographical scripts AND direct the visuals simultaneously.

═══════════════════════════════════════
YOUR TWO JOBS — STRICTLY SEPARATE
═══════════════════════════════════════

JOB 1 — SCRIPTWRITER (${effectiveLanguage}):
Write all narration, headlines, title, and script in ${effectiveLanguage === 'hindi'
            ? 'colloquial, beautifully spoken Hindi. You MUST write all Hindi narration text, headlines, and script strictly in pure DEVANAGARI HINDI characters (e.g., "पृथ्वीराज चौहान एक महान योद्धा थे..."). NEVER use Roman script / English alphabets (Hinglish like "Prithviraj Chauhan ek mahan...") for narrationText, script, title, or headlines. The audio generator needs Devanagari script to speak it with correct native Hindi pronunciation. Write for ears, not eyes.'
            : 'natural spoken English. Conversational, not academic.'
        }

JOB 2 — CINEMATOGRAPHER (English only):
For EACH scene, silently answer Q1-Q5 before writing the visualPrompt.
visualPrompt = English ONLY. Hindi in visualPrompt = broken image = failure.

SUBJECT: ${resolvedSubject}
LANGUAGE: ${effectiveLanguage}
ART STYLE: ${artStyle}
${seriesContext ? `SERIES CONTEXT: ${seriesContext}` : ''}
${visualStylePrompt ? `SERIES VISUAL STYLE: ${visualStylePrompt}` : ''}
${visualStyleOverride ? `REEL VISUAL OVERRIDE: ${visualStyleOverride}` : ''}

${BIOGRAPHICAL_FRAMEWORK}

${VISUAL_PROMPT_RULES}

═══════════════════════════════════════
SCRIPT WRITING RULES
═══════════════════════════════════════
${effectiveLanguage === 'hindi' ? `
  ❌ "उसने कई युद्ध लड़े"
  ✅ "1576 में हल्दीघाटी के उस संकरे दर्रे में, अकबर की 80,000 सेना के सामने..."
` : `
  ❌ "He fought many battles"
  ✅ "At Haldighati in June 1576, outnumbered 10 to 1 by Akbar's 80,000 forces..."
`}

RHYTHM — vary sentence length:
${effectiveLanguage === 'hindi'
            ? '"वो अकेला था। पूरी सेना उसके खिलाफ थी। और उसके पास सिर्फ एक रात थी।"'
            : '"He stood alone. The entire empire against him. And he had one night."'
        }

SPOKEN PAUSES — use "—" and "..." for dramatic effect.

SCENE VARIETY — across all ${sceneCount} scenes, use each angle at least once:
wide establishing, medium group, close-up portrait, low angle heroic,
aerial wide, over-shoulder, extreme close-up, action shot.
NEVER same angle twice in a row.

Return ONLY valid JSON. No markdown. No backticks. No text before or after JSON.
`;

    // ─────────────────────────────────────────────────────────
    // USER PROMPTS
    // ─────────────────────────────────────────────────────────
    const USER_PROMPT_CUSTOM = `
SUBJECT: ${resolvedSubject}
LANGUAGE: ${effectiveLanguage}

SCRIPT TO PROCESS (split this into ${sceneCount} scenes):
---
${customScript}
---

RULES:
${effectiveLanguage === 'hindi'
  ? '1. "script" field = the COMPLETE script converted to pure DEVANAGARI HINDI characters (if the provided script was in Roman script/Hinglish)'
  : '1. "script" field = the COMPLETE original text, word for word, unchanged'
}
2. narrationText of each scene = exact consecutive sentences from above (transcribed to pure DEVANAGARI HINDI characters if language is Hindi)
3. All narrationText combined = the full script above, nothing missing
4. visualPrompt = English ONLY, answer Q1-Q5 first, then write it
5. Exactly ${sceneCount} scenes

JSON output:
{
  "title": "Engaging ${effectiveLanguage} title about ${resolvedSubject}",
  "subject": "${resolvedSubject}",
  "script": "COMPLETE ORIGINAL SCRIPT HERE — UNCHANGED",
  "scenes": [
    {
      "headline": "3-4 word ${effectiveLanguage} scene title (MUST be Devanagari Hindi if Hindi)",
      "narrationText": "exact sentences from script for this scene (MUST be Devanagari Hindi if Hindi)",
      "visualPrompt": "English only, Q1-Q5 answered, max 250 chars, names ${resolvedSubject} explicitly",
      "durationInSeconds": ${sceneDuration}
    }
  ]
}`;

    const USER_PROMPT_AI = `
SUBJECT: ${resolvedSubject}
DURATION: ${durationInSeconds} seconds (${format})
WORD BUDGET: ${minWords}-${maxWords} words, aim for ${targetWords}. ${maxWords} is a HARD MAXIMUM.
This script is spoken aloud at about 2.5 words per second and must last ~${durationInSeconds}s. Going over makes the video too long and it gets trimmed.
SCENES: ${sceneCount} exactly
LANGUAGE: ${effectiveLanguage}

STEP 1 — Complete this story spine (include in JSON):
"${resolvedSubject} was born into ___, 
 faced ___ when ___, 
 until ___ at ___ [specific event + location + date], 
 proving that ___"

STEP 2 — Write the full script following the 6-beat biographical framework.
STEP 3 — Split into exactly ${sceneCount} scenes.
STEP 4 — For each scene's visualPrompt: answer Q1-Q5 silently, then write English-only prompt.
STEP 5 — Count the words in the "script" field. If under ${minWords}, expand. If over ${maxWords}, cut until it fits — tighten sentences, do not drop the ending.

JSON output:
{
  "title": "Viral ${effectiveLanguage} title — NOT just their name, make it intriguing",
  "subject": "${resolvedSubject}",
  "story_spine": "was born into... faced... until... proving...",
  "word_count_check": 0,
  "script": "Full continuous ${effectiveLanguage} script — ${minWords}-${maxWords} words",
  "scenes": [
    {
      "headline": "3-4 word ${effectiveLanguage} overlay text",
      "narrationText": "2-3 ${effectiveLanguage} sentences flowing from previous scene",
      "visualPrompt": "English only, specific subject+action+location+angle+style, max 250 chars",
      "durationInSeconds": ${sceneDuration}
    }
  ]
}

FINAL REMINDER:
- ${sceneCount} scenes exactly
- Between ${minWords} and ${maxWords} words in script (${maxWords} is a hard cap)
- Every visualPrompt in English, every narrationText in ${effectiveLanguage}
- Real names, real dates, real places — no invented facts
`;

    const SYSTEM_PROMPT_AI_PREMIUM = `
You are an elite, award-winning cinematic documentary director and viral storyteller. 
Your specialty is writing highly captivating, emotionally charged, and suspenseful faceless scripts that keep viewers hooked from the first second until the very end.

═══════════════════════════════════════
YOUR TWO JOBS — STRICTLY SEPARATE
═══════════════════════════════════════

JOB 1 — SCRIPTWRITER (${effectiveLanguage}):
- Write an incredibly compelling, dramatic narrative in ${effectiveLanguage === 'hindi'
            ? 'conversational, theatrical, highly intense Hindi. You MUST write all narration text, headlines, title, and script strictly in pure DEVANAGARI HINDI characters (e.g., "पृथ्वीराज चौहान एक महान योद्धा थे..."). NEVER use Roman script / English alphabets (Hinglish like "Prithviraj Chauhan ek mahan...") for narrationText, script, title, or headlines. The audio synthesis engine needs pure Devanagari text to pronounce Hindi words correctly without any weird accent. Write for theatrical ears, not textbook eyes.'
            : 'natural, highly evocative spoken English. Flowing, cinematic, and filled with dramatic tension.'
        }
- STYLE: Tell the story with intense drama. Use sensory details, high stakes, emotional highs and lows, and theatrical cliffhangers.
- RHYTHM: Use dramatic pauses ("—" and "...") extensively to guide the voiceover.

JOB 2 — CINEMATOGRAPHER (English only):
- For EACH scene, silently answer Q1-Q5 before writing the visualPrompt.
- visualPrompt = English ONLY. High dynamic range, professional color grading, cinematic shots.

SUBJECT: ${resolvedSubject}
LANGUAGE: ${effectiveLanguage}
ART STYLE: ${artStyle}
${seriesContext ? `SERIES CONTEXT: ${seriesContext}` : ''}
${visualStylePrompt ? `SERIES VISUAL STYLE: ${visualStylePrompt}` : ''}
${visualStyleOverride ? `REEL VISUAL OVERRIDE: ${visualStyleOverride}` : ''}

${VISUAL_PROMPT_RULES}

SCRIPT WRITING RULES FOR PREMIUM STORIES:
- IN MEDIA RES HOOK: Start directly in the middle of the most high-stakes, shocking, or emotional scene of the story. Do NOT start with childhood chronological details unless it's a dramatic event.
- NEVER list birthdates or dates dryly. Make every name, place, and event sound like a monumental turning point in human history.
- Ensure smooth dramatic flow: every scene must end on a hook that drags the viewer into the next.

Return ONLY valid JSON. No markdown. No backticks. No explanation.
`;

    const USER_PROMPT_AI_PREMIUM = `
SUBJECT: ${resolvedSubject}
DURATION: ${durationInSeconds} seconds (${format})
WORD BUDGET: ${minWords}-${maxWords} words, aim for ${targetWords}. ${maxWords} is a HARD MAXIMUM.
This script is spoken aloud at about 2.5 words per second and must last ~${durationInSeconds}s. Going over makes the video too long and it gets trimmed.
SCENES: ${sceneCount} exactly
LANGUAGE: ${effectiveLanguage}
${effectiveLanguage === 'hindi' ? `CRITICAL RULE: You MUST write the entire continuous script, scenes headlines, title, and narrationText strictly in pure DEVANAGARI HINDI script characters only. Do NOT use Roman letters (no English alphabets expressing Hindi words like Hinglish).` : ''}

STEP 1 — Write a high-stakes, cinematic, and emotionally intense storyline about ${resolvedSubject}. Focus on deep human struggle, betrayal, legendary triumphs, or historical mystery.
STEP 2 — Structure the script into exactly ${sceneCount} scenes. Each scene's narrationText must flow smoothly like a movie soundtrack voiceover.
STEP 3 — For each scene's visualPrompt: answer Q1-Q5 silently, then write English-only high-fidelity prompt matching the dramatic visual beat.
STEP 4 — Count the words in the "script" field. Keep it between ${minWords} and ${maxWords}; ${maxWords} is a hard cap.

JSON output:
{
  "title": "Viral, highly intriguing ${effectiveLanguage} title",
  "subject": "${resolvedSubject}",
  "word_count_check": 0,
  "script": "Full continuous ${effectiveLanguage} dramatic script — ${minWords}-${maxWords} words",
  "scenes": [
    {
      "headline": "3-4 word high-impact ${effectiveLanguage} caption overlay",
      "narrationText": "2-3 highly dramatic, beautifully spoken ${effectiveLanguage} sentences",
      "visualPrompt": "English only, specific subject+action+location+angle+style matching the emotional intensity, max 250 chars",
      "durationInSeconds": ${sceneDuration}
    }
  ]
}

FINAL REMINDER:
- Exactly ${sceneCount} scenes.
- Narration must sound like a cinematic documentary, not a biography.
- All visual prompts in English, narration in ${effectiveLanguage} ${effectiveLanguage === 'hindi' ? '(MUST be pure Devanagari Hindi characters, no Roman script/English letters)' : ''}.
`;

    // ─────────────────────────────────────────────────────────
    // LLM CALLS — priority order
    // ─────────────────────────────────────────────────────────
    const systemPrompt = isCustom 
        ? SYSTEM_PROMPT_CUSTOM 
        : (usePremium ? SYSTEM_PROMPT_AI_PREMIUM : SYSTEM_PROMPT_AI);
    const userPrompt = isCustom 
        ? USER_PROMPT_CUSTOM 
        : (usePremium ? USER_PROMPT_AI_PREMIUM : USER_PROMPT_AI);

    // 1. Claude (best quality, best JSON stability, best Hindi)
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (usePremium && anthropicKey) {
        try {
            console.log(`[LLM] Trying Claude Sonnet → ${resolvedSubject}`);
            const res = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "x-api-key": anthropicKey,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "claude-3-5-sonnet-20241022",
                    max_tokens: 4000,
                    system: systemPrompt,
                    messages: [{ role: "user", content: userPrompt }]
                })
            });
            if (res.ok) {
                const data = await res.json();
                const result = parseJSON(data.content[0].text);
                console.log(`[LLM] ✅ Claude success — ${result.scenes.length} scenes, subject: ${result.subject}`);
                return enrichWithSubject(result, resolvedSubject, stylePrompt, visualStylePrompt, visualStyleOverride, isCustom ? 0 : maxWords);
            }
            console.warn(`[LLM] Claude failed (${res.status}), trying Groq...`);
        } catch (e: any) {
            console.warn(`[LLM] Claude error: ${e.message}`);
        }
    }

    // 2. Groq 70b (fastest free option)
    const groqKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
    if (groqKey?.startsWith('gsk_')) {
        try {
            console.log(`[LLM] Trying Groq 70b → ${resolvedSubject}`);
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.8,
                    max_tokens: 4000
                })
            });
            if (res.ok) {
                const data = await res.json();
                const result = parseJSON(data.choices[0].message.content);
                console.log(`[LLM] ✅ Groq 70b success — ${result.scenes.length} scenes`);
                return enrichWithSubject(result, resolvedSubject, stylePrompt, visualStylePrompt, visualStyleOverride, isCustom ? 0 : maxWords);
            }
            console.warn(`[LLM] Groq 70b failed (${res.status}), trying 8b...`);

            // Groq 8b fallback (higher rate limits)
            const res8b = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "llama-3.1-8b-instant",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.8,
                    max_tokens: 4000
                })
            });
            if (res8b.ok) {
                const data = await res8b.json();
                const result = parseJSON(data.choices[0].message.content);
                console.log(`[LLM] ✅ Groq 8b success — ${result.scenes.length} scenes`);
                return enrichWithSubject(result, resolvedSubject, stylePrompt, visualStylePrompt, visualStyleOverride, isCustom ? 0 : maxWords);
            }
            console.warn(`[LLM] Groq 8b also failed`);
        } catch (e: any) {
            console.warn(`[LLM] Groq error: ${e.message}`);
        }
    }

    // 3. Gemini (free backup)
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
        try {
            console.log(`[LLM] Trying Gemini → ${resolvedSubject}`);
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
                        generationConfig: { temperature: 0.9, maxOutputTokens: 4000 }
                    })
                }
            );
            if (res.ok) {
                const data = await res.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                const result = parseJSON(text);
                console.log(`[LLM] ✅ Gemini success — ${result.scenes.length} scenes`);
                return enrichWithSubject(result, resolvedSubject, stylePrompt, visualStylePrompt, visualStyleOverride, isCustom ? 0 : maxWords);
            }
            console.warn(`[LLM] Gemini failed (${res.status})`);
        } catch (e: any) {
            console.warn(`[LLM] Gemini error: ${e.message}`);
        }
    }

    // 4. Local fallback for custom scripts (never fails)
    if (isCustom && customScript) {
        console.warn("[LLM] All AI providers failed — processing custom script locally");
        return enrichWithSubject(
            processManualScriptLocally(customScript, resolvedSubject, durationInSeconds, sceneDuration, stylePrompt),
            resolvedSubject,
            stylePrompt,
            visualStylePrompt,
            visualStyleOverride,
            0, // A script the user wrote is spoken in full, however long it runs.
        );
    }

    // 5. Static fallback (absolute last resort)
    console.error("[LLM] ALL providers failed — using static fallback");
    return enrichWithSubject(
        staticFallback(resolvedSubject, effectiveLanguage, durationInSeconds, sceneCount, sceneDuration, stylePrompt),
        resolvedSubject,
        stylePrompt,
        visualStylePrompt,
        visualStyleOverride,
        maxWords,
    );
}

// ─────────────────────────────────────────────────────────────
// ENRICH WITH SUBJECT
// Safety net: ensures every prompt has subject, angle, style, cap
// ─────────────────────────────────────────────────────────────
function enrichWithSubject(
    result: GeneratedScript,
    subject: string,
    stylePrompt: string,
    visualStylePrompt?: string,
    visualStyleOverride?: string,
    // Every provider path returns through here, so it is the one place the
    // word budget can be applied. Pass 0 to skip — a user-supplied script must
    // be spoken exactly as written.
    maxWords: number = 0,
): GeneratedScript {

    const budgeted = maxWords > 0 ? enforceWordBudget(result, maxWords) : result;
    result = budgeted;

    const trimmedBase = stylePrompt.split(',').slice(0, 6).join(',');
    const trimmedSeries = visualStylePrompt
        ? visualStylePrompt.split(',').slice(0, 5).join(',').substring(0, 150)
        : '';
    const trimmedOverride = visualStyleOverride
        ? visualStyleOverride.split(',').slice(0, 5).join(',').substring(0, 150)
        : '';

    return {
        ...result,
        subject,
        scenes: result.scenes.map((scene, index) => {

            // Step 1 — Sanitize: strip Hindi, emoji, pipes
            let prompt = sanitizeVisualPrompt(scene.visualPrompt || '');

            // Step 2 — Rebuild if sanitization left nothing useful
            if (prompt.length < 20) {
                console.warn(`[Enrich] Scene ${index + 1} prompt was empty/Hindi — rebuilding`);
                prompt = rebuildPromptFromNarration(scene.narrationText, subject, index);
            }

            // Step 3 — Ensure subject name is present
            if (!prompt.toLowerCase().includes(subject.toLowerCase())) {
                prompt = `${subject}, ${prompt}`;
            }

            // Step 4 — Inject camera angle if missing
            const angleKeywords = ['close-up', 'wide shot', 'wide establishing', 'medium shot',
                'aerial', 'low angle', 'portrait', 'establishing', 'over-the-shoulder',
                'over the shoulder', 'action shot', 'extreme close'];
            const hasAngle = angleKeywords.some(a => prompt.toLowerCase().includes(a));
            if (!hasAngle) {
                const angle = CAMERA_ANGLES[index % CAMERA_ANGLES.length];
                prompt = `${prompt}, ${angle}`;
            }

            // Step 5 — Append base art style if missing
            const styleKeyword = trimmedBase.split(',')[0].toLowerCase().trim();
            if (!prompt.toLowerCase().includes(styleKeyword)) {
                prompt = `${prompt}, ${trimmedBase}`;
            }

            // Step 6 — Append series visual style if missing
            if (trimmedSeries) {
                const seriesKeyword = trimmedSeries.split(',')[0].toLowerCase().trim();
                if (seriesKeyword && !prompt.toLowerCase().includes(seriesKeyword)) {
                    prompt = `${prompt}, ${trimmedSeries}`;
                }
            }

            // Step 7 — Append reel-level override if missing
            if (trimmedOverride) {
                const overrideKeyword = trimmedOverride.split(',')[0].toLowerCase().trim();
                if (overrideKeyword && !prompt.toLowerCase().includes(overrideKeyword)) {
                    prompt = `${prompt}, ${trimmedOverride}`;
                }
            }

            // Step 8 — Hard cap at 300 chars (trim from end to preserve subject+moment)
            if (prompt.length > 300) {
                prompt = prompt.substring(0, 300);
                const lastComma = prompt.lastIndexOf(',');
                if (lastComma > 200) prompt = prompt.substring(0, lastComma);
            }

            // Step 9 — Ensure "no text" instruction
            if (!prompt.includes('no text')) {
                prompt = `${prompt}, no text, no watermark`;
            }

            return { ...scene, visualPrompt: prompt };
        })
    };
}

// ─────────────────────────────────────────────────────────────
// REBUILD PROMPT FROM NARRATION
// Used when LLM wrote Hindi in visualPrompt
// ─────────────────────────────────────────────────────────────
function rebuildPromptFromNarration(
    narration: string,
    subject: string,
    sceneIndex: number
): string {
    const context = extractVisualContext(narration, subject);
    const angle = CAMERA_ANGLES[sceneIndex % CAMERA_ANGLES.length];
    return `${subject}, ${context}, ${angle}`;
}

// ─────────────────────────────────────────────────────────────
// EXTRACT VISUAL CONTEXT FROM NARRATION
// Reads Hindi/English narration and returns English visual description
// ─────────────────────────────────────────────────────────────
function extractVisualContext(narrationText: string, subject: string): string {
    const text = narrationText.toLowerCase();

    // Ship / journey / travel
    if (text.includes('जहाज') || text.includes('ship') || text.includes('titanic') ||
        text.includes('यात्रा') || text.includes('voyage') || text.includes('sailed') ||
        text.includes('समुद्र') || text.includes('ocean') || text.includes('नाव')) {
        return "massive ship departing harbor, crowds waving farewell, grand vessel in full view";
    }
    // Battle / war / fight
    if (text.includes('युद्ध') || text.includes('battle') || text.includes('war') ||
        text.includes('लड़ाई') || text.includes('fight') || text.includes('army') ||
        text.includes('सेना') || text.includes('तलवार') || text.includes('sword')) {
        return "fierce battle scene, soldiers in combat, weapons raised, dust and smoke filling air";
    }
    // Death / sinking / disaster / destruction
    if (text.includes('डूब') || text.includes('sinking') || text.includes('disaster') ||
        text.includes('मृत्यु') || text.includes('died') || text.includes('destroyed') ||
        text.includes('मर') || text.includes('death') || text.includes('collapse')) {
        return "catastrophic moment of destruction, dramatic chaos, desperate figures against ruin";
    }
    // Departure / beginning / first time
    if (text.includes('निकला') || text.includes('departed') || text.includes('began') ||
        text.includes('शुरू') || text.includes('started') || text.includes('पहली') ||
        text.includes('first') || text.includes('launch') || text.includes('रवाना')) {
        return "grand departure, beginning of epic journey, hopeful atmosphere, crowds gathered";
    }
    // Speech / declaration / announcement
    if (text.includes('कहा') || text.includes('said') || text.includes('declared') ||
        text.includes('announced') || text.includes('speech') || text.includes('बोले') ||
        text.includes('घोषणा') || text.includes('address') || text.includes('proclaimed')) {
        return "powerful speech to massive crowd, arms raised gesturing, audience riveted";
    }
    // Victory / triumph / won
    if (text.includes('जीत') || text.includes('victory') || text.includes('won') ||
        text.includes('triumph') || text.includes('conquered') || text.includes('विजय') ||
        text.includes('जीता') || text.includes('फतह')) {
        return "triumphant moment, arms raised to sky, victorious expression, golden light breaking";
    }
    // Childhood / birth / early life / young
    if (text.includes('बचपन') || text.includes('childhood') || text.includes('born') ||
        text.includes('young') || text.includes('जन्म') || text.includes('child') ||
        text.includes('किशोर') || text.includes('युवा') || text.includes('लड़का')) {
        return "young figure in humble surroundings, early life, warm domestic scene, innocence";
    }
    // Planning / strategy / thinking / meeting
    if (text.includes('सोचा') || text.includes('planned') || text.includes('strategy') ||
        text.includes('decided') || text.includes('योजना') || text.includes('meeting') ||
        text.includes('council') || text.includes('दरबार') || text.includes('सभा')) {
        return "figure bent over maps in candlelit chamber, strategic planning, intense concentration";
    }
    // Night / darkness / secret / hiding
    if (text.includes('रात') || text.includes('night') || text.includes('dark') ||
        text.includes('secret') || text.includes('अंधेरा') || text.includes('छुप') ||
        text.includes('hidden') || text.includes('shadow') || text.includes('fled')) {
        return "dramatic night scene, single torch light source, mysterious deep shadows, tension";
    }
    // Prison / captive / arrest
    if (text.includes('जेल') || text.includes('prison') || text.includes('captive') ||
        text.includes('arrested') || text.includes('कैद') || text.includes('बंदी')) {
        return "stone prison cell, bars casting shadows, lone figure in chains, dim light";
    }
    // Coronation / throne / king / crown
    if (text.includes('राजा') || text.includes('king') || text.includes('throne') ||
        text.includes('crown') || text.includes('राज्याभिषेक') || text.includes('सिंहासन') ||
        text.includes('coronation') || text.includes('emperor')) {
        return "royal coronation ceremony, grand throne room, golden crown, assembled court";
    }
    // Betrayal / treachery
    if (text.includes('धोखा') || text.includes('betrayal') || text.includes('traitor') ||
        text.includes('विश्वासघात') || text.includes('treachery')) {
        return "moment of betrayal, shocked expression, dramatic confrontation between two figures";
    }

    // Default — extract year if present, use dramatic scene
    const yearMatch = narrationText.match(/\d{4}/);
    const yearContext = yearMatch ? `${yearMatch[0]} era` : 'historical era';
    return `${subject} in pivotal dramatic moment, ${yearContext}, intense expression, turning point`;
}

// ─────────────────────────────────────────────────────────────
// LOCAL SCRIPT PROCESSOR
// Used when all LLMs fail — for custom scripts only
// ─────────────────────────────────────────────────────────────
function processManualScriptLocally(
    script: string,
    subject: string,
    durationInSeconds: number,
    sceneDuration: number,
    stylePrompt: string
): GeneratedScript {
    const sentences = script
        .split(/(?<=[.!?।…])\s+/)
        .filter(s => s.trim().length > 5);

    const { sceneCount } = getTargets(durationInSeconds);
    const totalSentences = sentences.length;
    const sentencesPerScene = Math.max(1, Math.ceil(totalSentences / sceneCount));

    const angles = [
        "wide establishing shot, vast environment, subject small in frame",
        "medium shot, subject with surroundings visible",
        "close-up portrait, face fills frame, strong emotion",
        "low angle heroic, subject against dramatic sky",
        "aerial wide shot, epic scale composition",
        "over-the-shoulder, subjective point of view",
        "extreme close-up, hands or symbolic detail",
        "medium wide action shot, full body visible",
    ];

    const scenes = [];
    for (let i = 0; i < sceneCount; i++) {
        const startIdx = i * sentencesPerScene;
        const endIdx = Math.min(startIdx + sentencesPerScene, totalSentences);
        const sceneText = startIdx < totalSentences
            ? sentences.slice(startIdx, endIdx).join(" ")
            : sentences[totalSentences - 1];

        const visualContext = extractVisualContext(sceneText, subject);
        const angle = angles[i % angles.length];

        scenes.push({
            headline: `${subject} — Part ${i + 1}`,
            narrationText: sceneText,
            visualPrompt: `${subject}, ${visualContext}, ${angle}, ${stylePrompt.split(',').slice(0, 4).join(',')}, no text`,
            durationInSeconds: sceneDuration
        });
    }

    return { title: `${subject} — The Story`, script, scenes };
}

// ─────────────────────────────────────────────────────────────
// JSON PARSER — robust, handles markdown fences
// ─────────────────────────────────────────────────────────────
function parseJSON(raw: string): GeneratedScript {
    try {
        const text = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');
        if (first === -1 || last === -1) throw new Error("No JSON object found in response");
        return JSON.parse(text.substring(first, last + 1));
    } catch (e: any) {
        throw new Error(`JSON parse failed: ${e.message}`);
    }
}

// ─────────────────────────────────────────────────────────────
// STATIC FALLBACK — absolute last resort
// ─────────────────────────────────────────────────────────────
function staticFallback(
    subject: string,
    language: string,
    durationInSeconds: number,
    sceneCount: number,
    sceneDuration: number,
    stylePrompt: string
): GeneratedScript {
    const isHindi = language.toLowerCase() === 'hindi';

    const visualMoments = [
        "heroic introduction, standing tall, wide establishing shot against vast landscape",
        "early life struggle, humble origins, medium shot in simple surroundings",
        "rising conflict, fierce determination, low angle shot against stormy sky",
        "pivotal battle or challenge, action shot, weapons or conflict visible",
        "moment of crisis, extreme close-up of face, raw emotion visible",
        "turning point decision, candlelit chamber, over-shoulder perspective",
        "triumph achieved, arms raised, aerial wide shot, golden light",
        "lasting legacy, reverent final shot, soft warm light"
    ];

    const scenes = Array.from({ length: sceneCount }, (_, i) => ({
        headline: isHindi ? `भाग ${i + 1}` : `Part ${i + 1}`,
        narrationText: isHindi
            ? `${subject} की यह कहानी का भाग ${i + 1}।`
            : `Part ${i + 1} of ${subject}'s story.`,
        visualPrompt: `${subject}, ${visualMoments[i % visualMoments.length]}, ${stylePrompt.split(',').slice(0, 4).join(',')}, no text`,
        durationInSeconds: sceneDuration
    }));

    return {
        title: subject,
        subject,
        script: scenes.map(s => s.narrationText).join(" "),
        scenes
    };
}