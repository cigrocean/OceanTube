import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Play, Clock, X } from 'lucide-react';
import { searchVideos } from '../utils/search';

function VideoSkeleton() {
    return (
        <div className="video-card skeleton-card">
            <div className="skeleton skeleton-thumb"></div>
            <div className="video-info" style={{gap:'8px'}}>
                <div className="skeleton skeleton-line"></div>
                <div className="skeleton skeleton-line short"></div>
            </div>
        </div>
    );
}

// ... (imports remain)

export function VideoSearch({ onSelect, onClose, initialQuery = '', initialResults = [], onQueryChange, onResultsChange, currentVideoId }) {
  const [query, setQuery] = useState(initialQuery);
  const [allResults, setAllResults] = useState(initialResults); // Full fetched list
  const [displayedResults, setDisplayedResults] = useState(initialResults.slice(0, 10)); // Visible list
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Interaction State
  const [processingId, setProcessingId] = useState(null);
  
  // Infinity Scroll
  const loadMoreRef = useRef(null);
  const [hasMore, setHasMore] = useState(initialResults.length > 10);

  // Batch size for "Infinite" simulation
  const BATCH_SIZE = 10;

  // Clear processing if the video actually starts playing (Immediate Success Feedback)
  useEffect(() => {
      if (currentVideoId && processingId === currentVideoId) {
          setProcessingId(null);
      }
  }, [currentVideoId, processingId]);

  const handleSelect = (video) => {
      if (processingId) return; // Prevent spamming while any action is pending
      
      setProcessingId(video.id);
      onSelect(video);
      
      // Safety reset after 3 seconds (in case it was just "Add to Queue" or server lag)
      setTimeout(() => {
          setProcessingId(prev => (prev === video.id ? null : prev));
      }, 3000);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setAllResults([]);
    setDisplayedResults([]);

    try {
      const videos = await searchVideos(query);
      if (videos.length === 0) {
        setError('No videos found.');
        setAllResults([]);
        setHasMore(false);
        onResultsChange?.([]); // Update parent
      } else {
        setAllResults(videos);
        setDisplayedResults(videos.slice(0, BATCH_SIZE));
        setHasMore(videos.length > BATCH_SIZE);
        onResultsChange?.(videos); // Update parent
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Update parent when query changes
  const handleQueryChange = (newQuery) => {
    setQuery(newQuery);
    onQueryChange?.(newQuery);
  };

  // Infinite Scroll Observer
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const first = entries[0];
      if (first.isIntersecting && hasMore) {
        loadMore();
      }
    }, { threshold: 0.5 }); // Trigger when 50% visible

    const currentSentinel = loadMoreRef.current;
    if (currentSentinel) observer.observe(currentSentinel);

    return () => {
      if (currentSentinel) observer.unobserve(currentSentinel);
    };
  }, [hasMore, displayedResults, allResults]);

  const loadMore = () => {
     // Simulate network delay for "feel" or just instant?
     // Instant is better for UX, but let's just append.
     const currentLen = displayedResults.length;
     const nextBatch = allResults.slice(currentLen, currentLen + BATCH_SIZE);
     
     if (nextBatch.length > 0) {
         setDisplayedResults(prev => [...prev, ...nextBatch]);
         if (currentLen + BATCH_SIZE >= allResults.length) {
             setHasMore(false);
         }
     } else {
         setHasMore(false);
     }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60); // Ensure integer
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="search-overlay">
      <div className="search-modal">
        <div className="search-header">
          <h3>Search YouTube</h3>
          <button className="btn-close" onClick={onClose} aria-label="Close search"><X size={24} /></button>
        </div>

        <form onSubmit={handleSearch} className="search-form">
          <div className="input-group">
            <Search size={20} className="input-icon" />
            <input
              type="text"
              placeholder="Search for videos..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn-primary" disabled={isLoading} aria-label={isLoading ? 'Searching...' : 'Search'} style={{ minWidth: '100px' }}>
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Search'}
            </button>
          </div>
        </form>

        <div className="search-results">
          {error && <div className="search-error">{error}</div>}
          
          <div className="results-grid">
            {isLoading 
                // Show Skeletons while loading
                ? Array(8).fill(0).map((_, i) => <VideoSkeleton key={i} />)
                : displayedResults.map((video) => (
                  <div 
                    key={video.id} 
                    className="video-card" 
                    onClick={() => handleSelect(video)}
                    style={{ 
                        cursor: processingId ? 'not-allowed' : 'pointer',
                        opacity: processingId && processingId !== video.id ? 0.5 : 1,
                        pointerEvents: processingId ? 'none' : 'auto'
                    }}
                  >
                    <div className="thumbnail-wrapper">
                      <img src={video.thumbnail} alt={video.title} loading="lazy" />
                      <span className="duration">{formatDuration(video.duration / 1000)}</span>
                      {processingId === video.id ? (
                        <div className="play-overlay" style={{background: 'rgba(0,0,0,0.6)', opacity: 1}}>
                            <Loader2 size={32} className="animate-spin" color="var(--accent-primary)" />
                        </div>
                      ) : (
                        <div className="play-overlay"><Play size={32} fill="white" stroke="white" /></div>
                      )}
                    </div>
                    <div className="video-info">
                      <div className="video-title" title={video.title}>{video.title}</div>
                      <div className="video-author">{video.author}</div>
                    </div>
                  </div>
            ))}
            
            {/* Sentinel for Infinite Scroll */}
            {!isLoading && hasMore && (
                 <div ref={loadMoreRef} style={{ height: '20px', width: '100%', gridColumn: '1/-1', display: 'flex', justifyContent: 'center' }}>
                     <Loader2 className="animate-spin" size={24} color="#6366f1" />
                 </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
