import { YouTube } from 'youtube-sr';

async function test() {
    try {
        console.log('Fetching video info...');
        const video = await YouTube.getVideo('https://www.youtube.com/watch?v=jfKfPfyJRdk'); 
        console.log('Video Title:', video.title);
        // Check for related/recommendations
        // Note: youtube-sr 'videos' property sometimes holds related items? Or is it not supported in this version?
        // Let's inspect keys.
        console.log('Keys:', Object.keys(video));
        if (video.videos && video.videos.length > 0) {
             console.log('Found "videos" property (Playlist/Related?):', video.videos.length);
        }
        // Try to access related if it exists (some versions have it)
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
