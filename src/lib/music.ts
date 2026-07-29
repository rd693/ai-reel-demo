export interface MusicTrack {
    id: string;
    name: string;
    url: string;
    category: 'cinematic' | 'ambient' | 'intense' | 'emotional';
}

export const MUSIC_TRACKS: MusicTrack[] = [
    {
        id: 'ambient_dream',
        name: 'Ambient Dream',
        url: '/music/ambient_dream.mp3',
        category: 'ambient'
    },
    {
        id: 'cinematic_tension',
        name: 'Cinematic Tension',
        url: '/music/cinematic_tension.mp3',
        category: 'cinematic'
    },
    {
        id: 'epic_narrative',
        name: 'Epic Narrative',
        url: '/music/epic_narrative.mp3',
        category: 'cinematic'
    },
    {
        id: 'dark_mystery',
        name: 'Dark Mystery',
        url: '/music/dark_mystery.mp3',
        category: 'intense'
    }
];

export const getDefaultMusic = () => MUSIC_TRACKS[0];

export const resolveTrackUrl = (trackId: string): string => {
    const track = MUSIC_TRACKS.find(t => t.id === trackId);
    if (track) return track.url;
    
    // If it looks like a URL already, return it
    if (trackId.startsWith('http') || trackId.startsWith('/')) {
        return trackId;
    }

    // Default fallback to first track
    return MUSIC_TRACKS[0].url;
};
