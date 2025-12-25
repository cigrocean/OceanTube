import React, { useRef, useEffect, useState } from 'react';
import { Music } from 'lucide-react';

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
    // If NO videoId, confirm destruction of any existing player
    if (!videoId) {
        if (playerRef.current) {
            console.log('VideoPlayer: ID removed, destroying player');
            try { playerRef.current.destroy(); } catch(e){}
            playerRef.current = null;
            setIsPlayerReady(false);
        }
        return;
    }

    if (playerRef.current) return; // Already initialized

    let isMounted = true;

    const initPlayer = () => {
        if (!isMounted) return;
        if (playerRef.current) return;
        
        // Safety: Ensure YT API is ready
        if (!window.YT || !window.YT.Player) {
            console.log('VideoPlayer: Waiting for YT API...');
            setTimeout(initPlayer, 100);
            return;
        }

        if (!containerRef.current) {
            console.warn('VideoPlayer: Container not ready, retrying...');
            setTimeout(initPlayer, 50);
            return;
        }
        
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
                                lastPlayingTime.current = Date.now(); // Mark active play
                                // Clear any pending pause (debounce)
                                if (adminPauseTimeout.current) {
                                    clearTimeout(adminPauseTimeout.current);
                                    adminPauseTimeout.current = null;
                                }
                                current.onPlay?.();
                            }
                            if (e.data === window.YT.PlayerState.PAUSED) {
                                console.log('[VideoPlayer] Admin PAUSE detected');
                                // Ignore auto-pauses from background tabs
                                if (document.visibilityState === 'hidden') {
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
                            // Non-admin clients: Relaxed Sync
                            // Only force play if we have a recent explicit Seek Intent (to fix buffering stuck)
                            // Otherwise, allow user to pause freely locally.
                            const hasRecentSeekIntent = (lastSeekIntent.current.playing && (Date.now() - lastSeekIntent.current.timestamp < 5000));

                            // If we pause but we *just* seeked-to-play -> Force Play (Fix buffering glitch)
                            if (e.data === window.YT.PlayerState.PAUSED && hasRecentSeekIntent) {
                                console.log('[VideoPlayer] Client Paused after Seek -> Forcing Resume (Intent)');
                                // Small timeout to allow UI interaction but enforce rule
                                setTimeout(() => {
                                    // Re-check recent intent (it's atomic)
                                    const intentValid = (lastSeekIntent.current.playing && (Date.now() - lastSeekIntent.current.timestamp < 5000));
                                        
                                    if (intentValid) {
                                        e.target.playVideo();
                                    }
                                }, 100);
                            }
                        }
                    },
                    onError: (e) => {
                        const current = stateRef.current;
                        console.error('[VideoPlayer] YouTube Player Error:', e.data);

                        // Specific error codes that indicate video is unavailable/invalid
                        // 100: Video not found
                        // 101, 150: Video not allowed to be played in an embedded player
                        if ([100, 101, 150].includes(e.data)) {
                            if (current.isAdmin) {
                                console.log('[VideoPlayer] Admin: Invalid video detected, calling onEnded to skip.');
                                current.onEnded?.(); // Trigger next video for admin
                            } else {
                                console.log('[VideoPlayer] User: Invalid video detected. Admin should skip.');
                                // For users, we just log. UI might show an error message.
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

    // Start initialization (will recurse if API not ready)
    initPlayer();

    return () => {
        isMounted = false;
    };
    
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

  /* Restored: adminPauseTimeout, lastPlayingTime heuristics */
  const adminPauseTimeout = useRef(null); // Debounce admin pauses
  const lastPlayingTime = useRef(0); // Track last play for seek heuristic
  const lastSeekIntent = useRef({ playing: false, timestamp: 0 }); // Track forced play intent from seek

  useEffect(() => {
      if (playing) lastPlayingTime.current = Date.now();
  }, [playing]);

  // ...

  // 3. Handle Play/Pause updates
  useEffect(() => {
      if (!isPlayerReady || !playerRef.current || typeof playerRef.current.playVideo !== 'function') return;
      
      // CRITICAL FIX: Admin controls itself via UI. React props should NOT force Admin player state.
      // This prevents the "Feedback Loop" where Admin Pauses -> State Update -> Prop Update -> Code forces Pause.
      if (isAdmin) return;

      // Strict Sync for Clients
      if (playing) {
          playerRef.current.playVideo();
      } else {
          playerRef.current.pauseVideo();
      }
  }, [playing, isPlayerReady, isAdmin]);

  // 4. Seek Detection (Polling Analysis)
  useEffect(() => {
      // Must have player, be admin, and be ready
      if (!isPlayerReady || !playerRef.current || !isAdmin) return;
      
      const checkInterval = 200; // Check 5 times per second for responsiveness
      let lastVideoTime = -1;
      let lastWallTime = 0;
      
      const timer = setInterval(() => {
          if (!playerRef.current || typeof playerRef.current.getCurrentTime !== 'function') return;
          
          try {
              const currentVideoTime = playerRef.current.getCurrentTime();
              const currentWallTime = Date.now();
              
              // Initialization phase
              if (lastVideoTime === -1) {
                  lastVideoTime = currentVideoTime;
                  lastWallTime = currentWallTime;
                  return;
              }

              const deltaVideo = Math.abs(currentVideoTime - lastVideoTime);
              const deltaWall = (currentWallTime - lastWallTime) / 1000; // ms to seconds
              const drift = Math.abs(deltaVideo - deltaWall);
              
              // PLAYBACK DETECTION:
              // If video advanced roughly same as wall clock (allow SMALL drift/jitter of 0.5s)
              // AND we actually moved forward > 0
              if (deltaVideo > 0 && drift < 0.5) {
                   lastPlayingTime.current = Date.now();
              }

              // SEEK DETECTION via DRIFT:
              // If video jumped significantly more (or less) than wall clock 
              // Threshold 1.0s handles both "Jump Forward" and "Rewind"
              // Also ensures standard lag (drift < 0.5) isn't flagged
              if (drift > 1.0) {
                  console.log(`[VideoPlayer] Seek Detected via Drift: Video=${deltaVideo.toFixed(2)}s, Wall=${deltaWall.toFixed(2)}s, Drift=${drift.toFixed(2)}s`);
                  console.log(`[VideoPlayer] Jump detected: ${lastVideoTime} -> ${currentVideoTime}`);
                  
                  // SMART SEEK: Heuristic logic
                  const wasPlayingRecently = (Date.now() - lastPlayingTime.current) < 10000;
                  const effectivePlaying = stateRef.current.playing || wasPlayingRecently;
                  
                  // Pass effective state to Sync via Ref (stable)
                  stateRef.current.onSeek?.(currentVideoTime, effectivePlaying);
                  
                  // Force ADMIN player to resume if heuristic applies
                  if (effectivePlaying) {
                      playerRef.current.playVideo();
                  }
              }
              
              lastVideoTime = currentVideoTime;
              lastWallTime = currentWallTime;
          } catch (e) {}
      }, checkInterval);
      
      return () => clearInterval(timer);
  }, [isPlayerReady, isAdmin, videoId]); // Reset on videoID change to prevent detecting new video start as seek

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
      
      // Helper to forcefully ensure playback resumes
      const ensurePlaying = () => {
           console.log('[VideoPlayer] Enforcing Playback...');
           playerRef.current.playVideo();
           
           // Retry strategy to overcome buffering/seek deadlocks
           setTimeout(() => { if (stateRef.current.playing) playerRef.current.playVideo(); }, 200);
           setTimeout(() => { if (stateRef.current.playing) playerRef.current.playVideo(); }, 500);
           setTimeout(() => { if (stateRef.current.playing) playerRef.current.playVideo(); }, 1000);
      };

      const onSync = ({ type, time, payload }) => {
          if (!isPlayerReady || typeof playerRef.current.seekTo !== 'function') return;
          
          switch (type) {
              case 'play':
                  // STRICT SYNC: Admin Play -> Everyone Plays
                  console.log('[VideoPlayer] Admin Play Received -> Forcing Resume');
                  ensurePlaying();
                  break;

              case 'pause':
                  playerRef.current.pauseVideo();
                  break;

              case 'seek':
                  // Payload can be number (legacy) or object { time, playing }
                  const seekTime = typeof payload === 'object' ? payload.time : payload;
                  const seekPlaying = typeof payload === 'object' ? payload.playing : true; // Default to true/playing if legacy

                  // Seek
                  console.log(`[VideoPlayer] Seeking to ${seekTime}, Playing: ${seekPlaying}`);
                  playerRef.current.seekTo(seekTime, true);
                  
                  // Double-Check Seek (Retry if failed)
                  setTimeout(() => {
                        if (!playerRef.current || typeof playerRef.current.getCurrentTime !== 'function') return;
                        const current = playerRef.current.getCurrentTime();
                        if (Math.abs(current - seekTime) > 2) {
                             console.log(`[VideoPlayer] Seek miss detected (${current} vs ${seekTime}). Retrying...`);
                             playerRef.current.seekTo(seekTime, true);
                        }
                  }, 500);

                  // STRICT SYNC: Seek always matches Admin state
                  // Ignore local props (which might be stale) and trust the packet.
                  if (!isAdmin) {
                      // Save intent for onStateChange fallback
                      lastSeekIntent.current = {
                          playing: seekPlaying,
                          timestamp: Date.now()
                      };
                      
                      if (seekPlaying) {
                           console.log('[VideoPlayer] Seek (Playing) -> Forcing Play (Robust)');
                           
                           // Create a "Blind Enforce" closure that trusts the packet, not the prop
                           const robustEnforce = () => {
                               if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
                                   playerRef.current.playVideo();
                               }
                           };
                           
                           // Trigger immediately and schedule retries to overcome buffering/race conditions
                           robustEnforce(); 
                           setTimeout(robustEnforce, 200);
                           setTimeout(robustEnforce, 500);
                           setTimeout(robustEnforce, 1000);
                           
                      } else {
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
              console.log(`[VideoPlayer] Syncing: Seeking to ${time}`);
              playerRef.current.seekTo(time, true);
          }
          
          // Strict Sync: Always match server
          if (shouldPlay) {
               // ONLY force play if we have a recent explicit Seek/Play intent.
               // If the user manually paused, the Heartbeat should NOT force resume.
               // This fixes "Client pauses but auto-resumes" issue.
               const intentValid = (lastSeekIntent.current.playing && (Date.now() - lastSeekIntent.current.timestamp < 5000));
               if (intentValid) {
                   ensurePlaying();
               }
          } else {
               playerRef.current.pauseVideo();
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
      {!videoId ? (
          <div style={{ 
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-primary) 100%)',
              color: 'var(--text-secondary)',
              padding: '0.5rem',
              boxSizing: 'border-box'
          }}>
               <div className="animate-pulse" style={{ padding: '1rem', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', marginBottom: '0.75rem' }}>
                    <Music size={40} strokeWidth={1.5} style={{ opacity: 0.6 }} />
               </div>
               <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>Waiting for DJ...</h3>
               <p style={{ margin: '0.25rem 0 0', opacity: 0.6, fontSize: '0.85rem', textAlign: 'center', maxWidth: '80%' }}>Queue is empty.</p>
          </div>
      ) : (
          <div 
            ref={containerRef}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          />
      )}
    </div>
  );
};
