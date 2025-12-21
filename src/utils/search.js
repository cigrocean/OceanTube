// Utility to search YouTube videos via our local proxy
// This avoids CORS issues by letting the server handle the upstream request

export async function searchVideos(query) {
  if (!query) return [];

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Search failed. Please try again.');
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error('Search error:', err);
    throw err;
  }
}
