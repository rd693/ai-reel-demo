export interface MusicTrack {
    id: string;
    name: string;
    url: string;
    category: 'cinematic' | 'ambient' | 'intense' | 'emotional';
}

/**
 * Background music available to reels.
 *
 * Deliberately empty. This shipped with four tracks named "Ambient Dream",
 * "Cinematic Tension", "Epic Narrative" and "Dark Mystery" — all of them
 * SoundHelix demo songs downloaded and renamed ("Ambient Dream" was really
 * "Spy vs. Spy", a 2010 dance track). One of them drew a Content ID claim that
 * blocked a published Short globally.
 *
 * Add your own licensed tracks by dropping mp3 files into public/music/ and
 * listing them here. Music you did not license is a liability on every upload,
 * so nothing is bundled by default.
 */
export const MUSIC_TRACKS: MusicTrack[] = [];

export const getDefaultMusic = (): MusicTrack | undefined => MUSIC_TRACKS[0];

export const resolveTrackUrl = (trackId: string): string => {
    const track = MUSIC_TRACKS.find(t => t.id === trackId);
    if (track) return track.url;

    // If it looks like a URL already, return it
    if (trackId.startsWith('http') || trackId.startsWith('/')) {
        return trackId;
    }

    // Tracks in public/music are identified by filename stem, and the library is
    // read from disk rather than from MUSIC_TRACKS. Emptying that list left this
    // lookup with nothing to match, so a generated track that was selected and
    // saved correctly still resolved to "" and played nothing.
    if (trackId) return `/music/${trackId}.mp3`;

    // No silent fallback to a default track: an unknown id used to mean "play
    // whatever is first", which is exactly how a track nobody chose ends up in
    // a published video, with a copyright claim behind it.
    return "";
};
