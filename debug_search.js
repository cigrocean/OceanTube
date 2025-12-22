import ytSearch from 'yt-search';

const query = 'rick roll';
console.log(`Searching for: ${query}`);

try {
    const result = await ytSearch(query);
    const videos = result.videos.slice(0, 1);
    
    if (videos.length > 0) {
        const video = videos[0];
        console.log('Video Found:', {
            title: video.title,
            videoId: video.videoId,
            seconds: video.seconds,
            duration: video.duration, // Check what keys exist
            timestamp: video.timestamp
        });
    } else {
        console.log('No videos found.');
    }
} catch (err) {
    console.error('Search failed:', err);
}
