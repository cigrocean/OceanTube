import { YouTube } from 'youtube-sr';
import ytSearch from 'yt-search';

async function test() {
    console.log('--- Testing youtube-sr ---');
    try {
        const videos = await YouTube.search('Rick Roll', { limit: 5 });
        console.log(`Success! Found ${videos.length} videos.`);
        console.log(videos[0].title);
    } catch (e) {
        console.error('youtube-sr failed:', e.message);
    }

    console.log('\n--- Testing yt-search ---');
    try {
        const result = await ytSearch('Rick Roll');
        const videos = result.videos.slice(0, 5);
        console.log(`Success! Found ${videos.length} videos.`);
        console.log(videos[0].title);
    } catch (e) {
        console.error('yt-search failed:', e.message);
    }
}

test();
