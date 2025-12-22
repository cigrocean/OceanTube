import React, { useRef, useEffect, useState } from 'react';

const getYouTubeID = (url) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

// Accept videoId directly, fallback to parsing url
export const VideoPlayer = ({ videoId: propVideoId, url, onProgress, playing, onPlay, onPause, onEnded, onSeek, isAdmin, socket, roomId, fitContainer = false }) => {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [videoId, setVideoId] = useState(propVideoId || getYouTubeID(url));
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [clientPaused, setClientPaused] = useState(false); // Track if client manually paused

  // Keep track of latest props to access them inside onReady/async callbacks without stale closures
  const stateRef = useRef({ playing, videoId });

  // Update refs whenever props change
  useEffect(() => {
      stateRef.current.playing = playing;
  }, [playing]);

  // Update internal videoId if props change
  useEffect(() => {
      const id = propVideoId || getYouTubeID(url);
      if (id) {
          setVideoId(id);
      }
  }, [propVideoId, url]);

  // Sync stateRef and Load Video when ID changes
  useEffect(() => {
      stateRef.current.videoId = videoId;
      
      // If player is ready and ID changes, load it appropriately
      if (isPlayerReady && playerRef.current && videoId) {
          const currentPlaying = stateRef.current.playing;
          if (currentPlaying) {
              // Load and continue playing
              if (typeof playerRef.current.loadVideoById === 'function') {
                  playerRef.current.loadVideoById(videoId);
              }
          } else {
              // Cue the video (shows thumbnail)
              if (typeof playerRef.current.cueVideoById === 'function') {
                  playerRef.current.cueVideoById(videoId);
              }
          }
      }
  }, [videoId, isPlayerReady]);

  // 2. Initialize Player
  useEffect(() => {
    if (!videoId) return;

    let isMounted = true;

    const initPlayer = () => {
        if (!isMounted) return;
        if (playerRef.current) return; // Player already exists
        if (!containerRef.current) return;
        
        console.log('VideoPlayer: Creating player for', videoId);

        containerRef.current.innerHTML = ''; 
        const playerDiv = document.createElement('div');
        containerRef.current.appendChild(playerDiv);

        try {
            const player = new window.YT.Player(playerDiv, {
                height: '100%',
                width: '100%',
                videoId: videoId, // Pass ID immediately to ensure load
                playerVars: {
                    autoplay: 0,
                    controls: 1,
                    modestbranding: 1,
                    rel: 0,
                    origin: window.location.origin,
                    enablejsapi: 1,
                    playsinline: 1
                },
                events: {
                    onReady: (e) => {
                        console.log('VideoPlayer: Ready');
                        setIsPlayerReady(true);
                        
                        // Apply latest state immediately
                        const currentState = stateRef.current;
                        
                        if (currentState.videoId && currentState.videoId !== videoId) {
                            // If ID changed during init, load the new one
                            if (currentState.playing) {
                                e.target.loadVideoById(currentState.videoId);
                                e.target.playVideo();
                            } else {
                                e.target.cueVideoById(currentState.videoId);
                            }
                        } else if (currentState.playing) {
                             // Same ID, just need to play if needed
                             e.target.playVideo();
                        }
                    },
                    onStateChange: (e) => {
                        // Admin controls broadcast their state changes
                        if (isAdmin) {
                            if (e.data === window.YT.PlayerState.PLAYING) onPlay?.();
                            if (e.data === window.YT.PlayerState.PAUSED) {
                                // Ignore auto-pauses from background tabs to prevent killing the server timer
                                if (document.visibilityState === 'hidden') {
                                    console.log('[VideoPlayer] Ignoring background auto-pause');
                                    return;
                                }
                                onPause?.();
                            }
                            if (e.data === window.YT.PlayerState.ENDED) onEnded?.();
                        }
                        
                        if (!isAdmin) {
                            // Non-admin clients: track their pause state
                            if (e.data === window.YT.PlayerState.PLAYING) {
                                setClientPaused(false); // Client chose to play
                                onPlay?.(); // This triggers request_sync in Room.jsx
                            }
                            if (e.data === window.YT.PlayerState.PAUSED) {
                                setClientPaused(true); // Client chose to pause
                            }
                        }
                    }
                }
            });
            playerRef.current = player;
            console.log('VideoPlayer: Player instance created');
        } catch (error) {
            console.error('VideoPlayer Error:', error);
        }
    };

    if (window.YT && window.YT.Player) {
        initPlayer();
    } else {
        const interval = setInterval(() => {
            if (window.YT && window.YT.Player) {
                clearInterval(interval);
                initPlayer();
            }
        }, 300);
        return () => {
            clearInterval(interval);
            isMounted = false;
        };
    }

    return () => { 
        isMounted = false;
        if (playerRef.current) {
            console.log('VideoPlayer: Destroying player instance');
            try {
                playerRef.current.destroy();
            } catch (e) {
                console.error('Error destroying player:', e);
            }
            playerRef.current = null;
            setIsPlayerReady(false);
        }
    };
  }, [videoId]); // Run initialization when videoId becomes available

  // 3. Handle Play/Pause updates
  useEffect(() => {
      if (!isPlayerReady || !playerRef.current || typeof playerRef.current.playVideo !== 'function') return;
      
      // Admin always follows the playing prop
      if (isAdmin) {
          if (playing) playerRef.current.playVideo();
          else playerRef.current.pauseVideo();
      } else {
          // No matter what, if client paused manually, STAY PAUSED
          if (clientPaused) {
              playerRef.current.pauseVideo();
              return;
          }

          // Otherwise follow admin
          if (playing) {
              playerRef.current.playVideo();
          } else {
              playerRef.current.pauseVideo();
          }
      }
  }, [playing, isPlayerReady, isAdmin, clientPaused]);

  // 4. Continuous Sync for Non-Admin Clients
  useEffect(() => {
      // Only non-admin clients need continuous sync
      if (isAdmin || !socket || !isPlayerReady || !playerRef.current) return;
      if (!playing) return; // Only sync while playing
      
      // Request sync every 5 seconds to stay in sync with admin
      const syncInterval = setInterval(() => {
          if (socket && playing) {
              socket.emit('request_sync', roomId);
          }
      }, 5000);
      
      return () => clearInterval(syncInterval);
  }, [isAdmin, socket, isPlayerReady, playing, roomId]);

  // 5. Socket Sync Handlers
  useEffect(() => {
      if (!socket || !playerRef.current) return;
      
      const onSync = ({ type, time, payload }) => {
          if (!isPlayerReady || typeof playerRef.current.seekTo !== 'function') return;
          
          switch (type) {
              case 'play':
                  // Admin playing always overrides client pause state
                  if (!isAdmin) setClientPaused(false);
                  playerRef.current.playVideo();
                  break;
              case 'pause':
                  // Admin pausing doesn't change clientPaused - client can still choose to play independently
                  playerRef.current.pauseVideo();
                  break;
              case 'seek':
                  // Seek to position
                  playerRef.current.seekTo(payload, true);
                  // Ensure we stay paused if client is paused
                  if (!isAdmin && clientPaused) {
                      playerRef.current.pauseVideo();
                  }
                  break;
          }
      };
      
      // Handle exact sync responses (from request_sync)
      const onSyncExact = ({ time, playing: shouldPlay }) => {
          if (!isPlayerReady || !playerRef.current) return;
          
          // Get current time
          const currentTime = playerRef.current.getCurrentTime?.() || 0;
          const timeDiff = Math.abs(currentTime - time);
          
          // Only seek if we're more than 2 seconds out of sync
          if (timeDiff > 2) {
              playerRef.current.seekTo(time, true);
          }
          
          // Respect client's pause state - don't force play/pause
          // Client will stay paused if they chose to pause
      };
      
      // Admin responds to sync requests with current time
      const onGetTime = ({ requesterId }) => {
          if (!isAdmin || !isPlayerReady || !playerRef.current) return;
          
          const currentTime = playerRef.current.getCurrentTime?.() || 0;
          const isPlaying = playerRef.current.getPlayerState?.() === window.YT.PlayerState.PLAYING;
          
          socket.emit('time_report', {
              requesterId,
              time: currentTime,
              playing: isPlaying
          });
      };
      
      socket.on('sync_action', onSync);
      socket.on('sync_exact', onSyncExact);
      socket.on('get_time', onGetTime);
      
      return () => {
          socket.off('sync_action', onSync);
          socket.off('sync_exact', onSyncExact);
          socket.off('get_time', onGetTime);
      };
  }, [socket, isPlayerReady]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      paddingTop: fitContainer ? '0' : '56.25%', /* 16:9 Aspect Ratio if not fitting container */
      height: fitContainer ? '100%' : 'auto',
      backgroundColor: 'black',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
    }}>
      <div 
        ref={containerRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      />
    </div>
  );
};
