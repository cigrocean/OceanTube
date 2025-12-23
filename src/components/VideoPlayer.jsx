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
  // Track if client manually paused - Use Ref to avoid stale closures in listeners
  const [clientPaused, setClientPaused] = useState(false); 
  const clientPausedRef = useRef(clientPaused);
  const isSyncing = useRef(false); // Guard against seek-induced pause events
  const ignorePausesUntil = useRef(0); // Guard against admin-induced pause events
  const adminPauseTimeout = useRef(null); // Debounce admin pauses

  useEffect(() => {
      clientPausedRef.current = clientPaused;
  }, [clientPaused]);




  // Keep track of latest props to access them inside onReady/async callbacks without stale closures
  const stateRef = useRef({ playing, videoId, isAdmin, onPlay, onPause, onEnded, onSeek });

  // Update refs whenever props change
  useEffect(() => {
      stateRef.current = { playing, videoId, isAdmin, onPlay, onPause, onEnded, onSeek };
  }, [playing, videoId, isAdmin, onPlay, onPause, onEnded, onSeek]);

  // Update internal videoId if props change
  useEffect(() => {
      const id = propVideoId || getYouTubeID(url);
      if (id) {
          setVideoId(id);
      }
  }, [propVideoId, url]);

  // ... (Load video effect usually follows here)

  // 2. Initialize Player - Only run if player doesn't exist
  useEffect(() => {
    if (!videoId) return;
    if (playerRef.current) return; // Already initialized

    let isMounted = true;

    const initPlayer = () => {
        if (!isMounted) return;
        if (playerRef.current) return;
        if (!containerRef.current) return;
        
        console.log('VideoPlayer: Creating player for', videoId);

        containerRef.current.innerHTML = ''; 
        const playerDiv = document.createElement('div');
        containerRef.current.appendChild(playerDiv);

        try {
            const player = new window.YT.Player(playerDiv, {
                height: '100%',
                width: '100%',
                videoId: videoId, 
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
                             e.target.loadVideoById(currentState.videoId);
                        }
                             
                        if (currentState.playing) {
                             e.target.playVideo();
                        } else {
                             // Force pause/cue to show thumbnail
                             if (currentState.videoId === videoId) {
                                  e.target.cueVideoById(videoId);
                             }
                        }
                    },
                    onStateChange: (e) => {
                        // ALWAYS read fresh state from ref to avoid stale closures
                        const current = stateRef.current;
                        const isAdminCurrent = current.isAdmin;

                        console.log('[VideoPlayer] State Change:', e.data, 'Admin:', isAdminCurrent);
                        
                        // Admin controls broadcast their state changes
                        if (isAdminCurrent) {
                            if (e.data === window.YT.PlayerState.PLAYING) {
                                console.log('[VideoPlayer] Admin PLAY detected');
                                // Clear any pending pause (debounce)
                                if (adminPauseTimeout.current) {
                                    clearTimeout(adminPauseTimeout.current);
                                    adminPauseTimeout.current = null;
                                }
                                current.onPlay?.();
                            }
                            if (e.data === window.YT.PlayerState.PAUSED) {
                                console.log('[VideoPlayer] Admin PAUSE event (Debouncing)');
                                // Ignore auto-pauses from background tabs
                                if (document.visibilityState === 'hidden') {
                                    console.log('[VideoPlayer] Ignoring background auto-pause');
                                    return;
                                }
                                
                                // Debounce Pause: Wait 250ms to see if it's just a seek
                                if (adminPauseTimeout.current) clearTimeout(adminPauseTimeout.current);
                                
                                adminPauseTimeout.current = setTimeout(() => {
                                    console.log('[VideoPlayer] Admin PAUSE confirmed (Timeout)');
                                    current.onPause?.();
                                    adminPauseTimeout.current = null;
                                }, 250);
                            }
                            if (e.data === window.YT.PlayerState.ENDED) current.onEnded?.();
                        }
                        
                        if (!isAdminCurrent) {
                            // Non-admin clients: track their pause state
                            if (e.data === window.YT.PlayerState.PLAYING) {
                                setClientPaused(false); // Client chose to play
                                clientPausedRef.current = false; // UPDATE REF IMMEDIATELY to prevent race condition
                                current.onPlay?.(); // This triggers request_sync in Room.jsx
                                
                                // FORCE SYNC ON RESUME
                                // If we were manually paused while admin played, we are behind.
                                // We need to ask the server "Where are we now?" immediately.
                                if (socket) {
                                    console.log('[VideoPlayer] Manual Resume -> Requesting immediate sync');
                                    socket.emit('request_sync', roomId);
                                }
                            }
                            if (e.data === window.YT.PlayerState.PAUSED) {
                                // 1. Check if this was a remote pause (Admin paused us)
                                if (Date.now() < ignorePausesUntil.current) {
                                    console.log('[VideoPlayer] Ignoring Remote-induced PAUSE');
                                    return;
                                }

                                // 2. Only mark as manual pause if we're not in the middle of a sync/seek
                                if (!isSyncing.current) {
                                    console.log('[VideoPlayer] Manual Pause Detected');
                                    setClientPaused(true); // Client chose to pause
                                    clientPausedRef.current = true; // UPDATE REF IMMEDIATELY
                                } else {
                                    console.log('[VideoPlayer] Ignoring Seek-induced PAUSE');
                                }
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
    
  // Cleanup handled by separate effect
  }, []); 
  
  // 2a. Handle Video ID Updates (Reuse Player)
  useEffect(() => {
      if (!isPlayerReady || !playerRef.current) return;
      if (!videoId) return;

      console.log(`[VideoPlayer] Switching video to: ${videoId}`);
      try {
          // If we are already playing, load and play.
          // If we were paused, cued might be better, but for auto-play we usually want to play.
          // Given the server auto-play nature, we should force play.
          playerRef.current.loadVideoById(videoId);
      } catch(e) {
          console.error('[VideoPlayer] Error loading video:', e);
      }
  }, [videoId, isPlayerReady]); 

  // 2b. Cleanup Effect (Run only on unmount)
  useEffect(() => {
      return () => {
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
  }, []);

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

  // 4. Seek Detection (Polling)
  useEffect(() => {
      if (!isPlayerReady || !playerRef.current || !isAdmin) return;
      
      const checkInterval = 1000;
      let lastTime = 0;
      
      const timer = setInterval(() => {
          if (!playerRef.current || typeof playerRef.current.getCurrentTime !== 'function') return;
          
          try {
              const currentTime = playerRef.current.getCurrentTime();
              // If time difference is > 2s (normal playback is ~1s per 1s), we assume seek
              // We also need to ignore the initial startup jump
              const diff = Math.abs(currentTime - lastTime);
              
              if (diff > 1.5 && lastTime > 0) {
                  console.log(`[VideoPlayer] Detected seek: ${lastTime} -> ${currentTime}`);
                  // Pass current playing state to Sync
                  onSeek?.(currentTime, stateRef.current.playing);
              }
              
              lastTime = currentTime;
          } catch (e) {}
      }, checkInterval);
      
      return () => clearInterval(timer);
  }, [isPlayerReady, isAdmin, onSeek]);

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
                  // User Requirement: "Client pauses is not affected by the admin"
                  // If client manually paused, they stay paused until THEY click play.
                  if (clientPausedRef.current && !isAdmin) {
                      console.log('[VideoPlayer] Ignoring Admin Play because Client is manually paused.');
                      return; 
                  }
                  
                  playerRef.current.playVideo();
                  break;
              case 'pause':
                  // Admin pausing doesn't change clientPaused - client can still choose to play independently
                  if (!isAdmin) {
                       // Use a time window to ignore any PAUSED events triggered by this remote command
                       ignorePausesUntil.current = Date.now() + 2000; 
                  }
                  playerRef.current.pauseVideo();
                  break;
              case 'seek':
                  // Payload can be number (legacy) or object { time, playing }
                  const seekTime = typeof payload === 'object' ? payload.time : payload;
                  const seekPlaying = typeof payload === 'object' ? payload.playing : true; // Default to true/playing if legacy

                  // Seek
                  playerRef.current.seekTo(seekTime, true);
                  
                  // Enforcement
                  if (!isAdmin) {
                      if (clientPausedRef.current) {
                           // 1. If Client is manually paused, STAY PAUSED
                           playerRef.current.pauseVideo();
                      } else if (seekPlaying) {
                           // 2. If Admin is playing (and we are not manually paused), PLAY
                           console.log('[VideoPlayer] Seek (Playing) -> Forcing Play');
                           setTimeout(() => playerRef.current.playVideo(), 200);
                      } else {
                           // 3. If Admin is paused, PAUSE
                           playerRef.current.pauseVideo();
                      }
                  }
                  break;
          }
      };
      
      const onSyncExact = ({ time, playing: shouldPlay }) => {
          if (!isPlayerReady || !playerRef.current) return;
          
          const currentTime = playerRef.current.getCurrentTime?.() || 0;
          const timeDiff = Math.abs(currentTime - time);
          
          if (timeDiff > 2) {
              console.log(`[VideoPlayer] Syncing: Seeking to ${time} (Diff: ${timeDiff.toFixed(2)}s)`);
              
              isSyncing.current = true; // LOCK 'clientPaused' updates
              playerRef.current.seekTo(time, true);
              
              // Unlock after brief delay to allow events to settle
              setTimeout(() => { isSyncing.current = false; }, 1500);
          }
          
          // If server is playing and we are not manually paused, force play
          // (This handles cases where seekTo might have left us paused)
          if (shouldPlay && !clientPausedRef.current) {
               playerRef.current.playVideo();
          }
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
