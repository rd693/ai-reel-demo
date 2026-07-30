export type VoiceProfile = {
    id: string;
    name: string;
    language?: string;
    gender?: string;
    useCase?: string;
    descriptive?: string;
    age?: string;
    category?: string;
};

export type VoiceCriteria = {
    /** ISO code the reel is narrated in, e.g. "hi". */
    langCode?: string;
    /** Free text describing the series: niche plus its context blurb. */
    context?: string;
    preferFemale?: boolean;
};

// ElevenLabs tags every voice with a use_case. Mapping the series niche onto
// that vocabulary is what lets a history channel get a narrator instead of the
// social-media voice that happens to be first in the list.
const USE_CASE_RULES: [RegExp, string][] = [
    [/\b(offer|sale|deal|promo|advert|brand|product|launch)/i, "advertisement"],
    [/\b(motivat|viral|trend|gossip|meme|hype|challenge)/i, "social_media"],
    [/\b(science|educat|explain|lesson|fact|tutorial|learn|tech|how)/i, "informative_educational"],
    [/\b(character|cartoon|anime|fiction|roleplay)/i, "characters_animation"],
    [/\b(history|myth|legend|story|stories|tale|documentary|biograph|ancient|war|empire)/i, "narrative_story"],
];

// Faceless reels are narrated stories more often than anything else.
const DEFAULT_USE_CASE = "narrative_story";

const TONE_RULES: [RegExp, string[]][] = [
    [/\b(horror|scary|creepy|dark|haunt|ghost|mystery|thriller)/i, ["rough", "mature", "confident"]],
    [/\b(motivat|hype|energetic|viral|upbeat|workout)/i, ["hyped", "confident", "upbeat"]],
    [/\b(calm|medit|relax|sleep|asmr|soothing)/i, ["calm", "chill"]],
    [/\b(luxury|premium|elegant|classy|fashion)/i, ["classy", "professional"]],
    [/\b(kids|children|playful|fun)/i, ["cute", "casual"]],
];

export function useCaseFor(context: string | undefined): string {
    if (!context) return DEFAULT_USE_CASE;
    for (const [pattern, useCase] of USE_CASE_RULES) {
        if (pattern.test(context)) return useCase;
    }
    return DEFAULT_USE_CASE;
}

export function tonesFor(context: string | undefined): string[] {
    if (!context) return [];
    for (const [pattern, tones] of TONE_RULES) {
        if (pattern.test(context)) return tones;
    }
    return [];
}

/**
 * Ranks voices for a series.
 *
 * Language is the strongest signal by far — an English voice reading Hindi is
 * wrong in a way no amount of tonal fit makes up for — so it outweighs
 * everything else combined. Use case comes next, then tone, then gender.
 *
 * Availability is deliberately not considered. A voice the current plan cannot
 * use still ranks first if it fits best; the caller discovers that by calling
 * and falls through to the next one. That keeps this function pure and means an
 * upgraded plan immediately gets the better voice with no code change.
 */
export function scoreVoice(voice: VoiceProfile, criteria: VoiceCriteria): number {
    let score = 0;

    if (criteria.langCode) {
        if (voice.language === criteria.langCode) score += 100;
        else if (voice.language) score -= 50; // a voice native to some other language
    }

    if (voice.useCase && voice.useCase === useCaseFor(criteria.context)) score += 8;

    const tones = tonesFor(criteria.context);
    if (voice.descriptive && tones.includes(voice.descriptive)) score += 4;

    if (criteria.preferFemale !== undefined) {
        const wanted = criteria.preferFemale ? "female" : "male";
        if (voice.gender === wanted) score += 2;
    }

    return score;
}

/** Voices ordered best-first for this series. */
export function rankVoices(voices: VoiceProfile[], criteria: VoiceCriteria): VoiceProfile[] {
    return voices
        .map((voice) => ({ voice, score: scoreVoice(voice, criteria) }))
        // Stable within a score band so the ordering does not jitter run to run.
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.voice);
}
