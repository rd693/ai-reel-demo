/**
 * SSML (Speech Synthesis Markup Language) Builder for Azure TTS
 * Handles pauses, emphasis, and natural speech markers.
 */

interface VoiceConfig {
    lang: string;
    voice: string;
    rate: string;
    pitch: string;
}

export function buildSSML(text: string, language: string = 'english', voiceId: string = 'antoni'): string {
    const voiceConfig = getVoiceConfig(language, voiceId);
    const processedText = processMarkers(text);

    // Leanest possible SSML
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voiceConfig.lang}"><voice name="${voiceConfig.voice}"><prosody rate="${voiceConfig.rate}" pitch="${voiceConfig.pitch}">${processedText}</prosody></voice></speak>`;
}

function getVoiceConfig(language: string, voiceId: string): VoiceConfig {
    const langKey = language.toLowerCase();
    const vId = voiceId.toLowerCase();

    const configs: Record<string, { lang: string; voices: Record<string, string>; rate: string; pitch: string }> = {
        english: {
            lang: 'en-US',
            voices: { antoni: 'en-US-AndrewNeural', bella: 'en-US-JennyNeural', arnold: 'en-US-GuyNeural', josh: 'en-US-ChristopherNeural' },
            rate: '0.92', pitch: '0%'
        },
        hindi: {
            lang: 'hi-IN',
            voices: { antoni: 'hi-IN-ArjunNeural', bella: 'hi-IN-SwaraNeural', arnold: 'hi-IN-MadhurNeural', josh: 'hi-IN-ArjunNeural' },
            rate: '+8%', pitch: '+2%'
        },
        french: {
            lang: 'fr-FR',
            voices: { antoni: 'fr-FR-HenriNeural', bella: 'fr-FR-DeniseNeural', arnold: 'fr-FR-HenriNeural', josh: 'fr-FR-DeniseNeural' },
            rate: '0.95', pitch: '0%'
        },
        german: {
            lang: 'de-DE',
            voices: { antoni: 'de-DE-ConradNeural', bella: 'de-DE-KatjaNeural', arnold: 'de-DE-ConradNeural', josh: 'de-DE-KatjaNeural' },
            rate: '0.95', pitch: '0%'
        },
        spanish: {
            lang: 'es-ES',
            voices: { antoni: 'es-ES-AlvaroNeural', bella: 'es-ES-ElviraNeural', arnold: 'es-ES-AlvaroNeural', josh: 'es-ES-ElviraNeural' },
            rate: '0.95', pitch: '0%'
        }
    };

    const config = configs[langKey] || configs.english;
    return {
        lang: config.lang,
        voice: config.voices[vId] || Object.values(config.voices)[0],
        rate: config.rate,
        pitch: config.pitch
    };
}

function processMarkers(text: string): string {
    let processed = escapeXML(text);

    // Normalize excessive blank lines first
    processed = processed.replace(/\n{2,}/g, '\n');

    // Ellipsis BEFORE sentence dots
    processed = processed.replace(/\.{3}|…/g, '<break time="250ms"/>');

    // Sentence endings
    processed = processed.replace(/([।.!])\s*/g, '$1<break time="250ms"/> ');

    // Questions
    processed = processed.replace(/\?\s*/g, '?<break time="350ms"/> ');

    // Commas
    processed = processed.replace(/([,،])\s*/g, '$1<break time="100ms"/> ');

    // Dash
    processed = processed.replace(/\s*—\s*/g, '<break time="180ms"/> ');

    // Single newline only, not huge pause
    processed = processed.replace(/\n/g, '<break time="180ms"/> ');

    return processed.trim();
}

function escapeXML(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}
