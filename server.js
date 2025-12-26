import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';
import { YouTube } from 'youtube-sr';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// CORS configuration for production deployment
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:5173'];

// Apply CORS only to API routes to avoid conflict with Socket.IO
app.use('/api', cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: true
}));

const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for debugging
    methods: ["GET", "POST"],
    credentials: false // Must be false when origin is *
  },
  perMessageDeflate: false // Fixes random connection drops on some clients
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Search Cache: Query -> { timestamp: number, results: Array }
const searchCache = new Map();
const CACHE_TTL = 3600 * 1000; // 1 Hour

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  // 1. Check Cache
  const normalizedQuery = query.toLowerCase().trim();
  if (searchCache.has(normalizedQuery)) {
      const cached = searchCache.get(normalizedQuery);
      const isFresh = (Date.now() - cached.timestamp) < CACHE_TTL;
      
      if (isFresh) {
          console.log(`[Search] Serving cached results for: "${query}"`);
          return res.json(cached.results);
      }
  }

  try {
      console.log(`[Search] Fetching from YouTube (youtube-sr): "${query}"`);
      // Use youtube-sr for faster results
      const videos = await YouTube.search(query, { limit: 20, type: 'video' });
      
      if (!videos || videos.length === 0) {
           return res.json([]);
      }

      const results = videos.map(video => ({
          id: video.id,
          title: video.title,
          author: video.channel ? video.channel.name : 'Unknown',
          thumbnail: video.thumbnail ? video.thumbnail.url : '', 
          duration: video.duration / 1000 // youtube-sr returns ms
      }));
      
      // 2. Store in Cache
      searchCache.set(normalizedQuery, {
          timestamp: Date.now(),
          results: results
      });
      
      // Prune cache if too large
      if (searchCache.size > 1000) {
          const firstKey = searchCache.keys().next().value;
          searchCache.delete(firstKey);
      }
      
      return res.json(results);
  } catch (err) {
      console.error('YouTube Search Failed:', err);
      res.status(500).json({ error: `Search failed: ${err.message}` });
  }
});

// Helper to parse "MM:SS" or "HH:MM:SS" to seconds


app.use(express.static(path.join(__dirname, 'dist')));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// Room state: { roomId: { videoId, playing, sentiment, users: [{id, name, sessionId}], admin: string, adminSessionId: string } }
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', ({ roomId, username, sessionId, password }) => { // Accept password
    const room = roomId;
    const name = username || `User ${socket.id.substring(0, 4)}`; // Default name if not provided
    
    // Create room if doesn't exist
    if (!rooms[room]) {
      // Admin session logic (first user)
      const adminSessionId = sessionId;
      rooms[room] = { 
        videoId: null, 
        currentTitle: null, // No title initially
        playing: false, 
        timestamp: 0,
        users: [],
        admin: socket.id, // Creator is admin
        adminSessionId: adminSessionId,
        password: password || null, // Set initial password if provided
        queue: [] // Video Queue
      };
      console.log(`Room ${room} created by ${name}${password ? ' (Protected)' : ''}`);
    } else {
        // Clear cleanup timer if exists (User Reconnected)
        if (rooms[room].cleanupTimer) {
             console.log(`Room ${room} deletion cancelled (User joined).`);
             clearTimeout(rooms[room].cleanupTimer);
             rooms[room].cleanupTimer = null;
        }

        // Room exists determine admin via session
        if (rooms[room].users.length === 0) {
             // If room exists but all users left, the current user becomes admin
             rooms[room].admin = socket.id;
             rooms[room].adminSessionId = sessionId;
             console.log(`Room ${room} re-initialized with new admin ${name}`);
        } else if (sessionId && rooms[room].adminSessionId === sessionId) {
             // Restore admin status if session matches
             rooms[room].admin = socket.id;
             io.to(room).emit('admin_changed', { newAdminId: socket.id, newAdminName: name });
             console.log(`Admin restored for session ${sessionId} in room ${room}`);
        }
        
        if (rooms[room].password) { // If room has a password set
             // Check if the user is already in the room (reconnecting with same socket.id)
             const isExistingUser = rooms[room].users.some(u => u.id === socket.id);
             
             // Check if this is a known session (e.g. admin reloading)
             const isKnownSession = rooms[room].users.find(u => u.sessionId === sessionId);
             const isAdminSession = rooms[room].adminSessionId === sessionId;

             // If not existing user AND not known session AND not admin session -> require password
             if (!password && !isExistingUser && !isKnownSession && !isAdminSession) {
                  socket.emit('password_required', { roomId: room });
                  return;
             } else if (password && rooms[room].password !== password && !isExistingUser && !isKnownSession && !isAdminSession) { 
                  socket.emit('invalid_password', { roomId: room, message: 'Incorrect Room PIN' });
                  return;
             }
        }
    }

    socket.join(room);
    
    const existingUserIndex = rooms[roomId].users.findIndex(u => u.sessionId === sessionId);
    
    let userToEmit;
    if (existingUserIndex !== -1) {
        // Update existing user's socket ID (reconnection)
        const user = rooms[roomId].users[existingUserIndex];
        
        // CHECK FOR DUPLICATE TAB:
        // If the user is NOT inactive (meaning they are currently connected and didn't just leave),
        // and the ID is different (meaning it's a new socket, not a weird re-emit from same socket),
        // THEN it's a duplicate tab.
        // We check `!user.inactive` because if they are inactive, they are in the "Grace Period" waiting to reconnect.
        // We also check if the OLD socket is still actually connected (optional but safer).
        if (!user.inactive && user.id !== socket.id) {
             const oldSocket = io.sockets.sockets.get(user.id);
             if (oldSocket && oldSocket.connected) {
                 console.log(`[Join] Duplicate session rejected for ${name} (${sessionId})`);
                 socket.emit('duplicate_session');
                 return; // STOP. Do not join the room.
             }
        }

        user.id = socket.id;
        user.name = name; // Update name if changed
        
        // CANCEL LEAVE TIMER if it exists
        if (user.leaveTimer) {
             clearTimeout(user.leaveTimer);
             user.leaveTimer = null;
             user.inactive = false;
             console.log(`User ${name} reconnected (Grace period).`);
        }
        
        userToEmit = user;
    } else {
        // Add new user
        const newUser = { 
            id: socket.id, 
            name: name,
            sessionId: sessionId
        };
        rooms[roomId].users.push(newUser);
        userToEmit = newUser;
    }
    
    // If it's a new user, broadcast join. If existing (reconnect), broadcast update.
    if (existingUserIndex === -1) {
         io.to(roomId).emit('user_joined', { user: userToEmit, count: rooms[roomId].users.length, admin: rooms[roomId].admin });
    } else {
         io.to(roomId).emit('user_updated', userToEmit);
    }
    
    // Send full state to the new/reconnecting user so they know if they are admin, current video, etc.
    socket.emit('sync_state', rooms[roomId]);
  });

  socket.on('update_name', ({ roomId, name }) => {
     if (!rooms[roomId]) return;
     const user = rooms[roomId].users.find(u => u.id === socket.id);
     if (user) {
         user.name = name;
         io.to(roomId).emit('user_updated', user);
         // Also resend full list just in case is easier for clients
         io.to(roomId).emit('sync_state', rooms[roomId]); // Or just rely on user_updated
     }
  });

  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (rooms[room]) {
        const userIndex = rooms[room].users.findIndex(u => u.id === socket.id);
        const leaver = userIndex !== -1 ? rooms[room].users[userIndex] : null; // Get full user object
        
        if (leaver) {
            // Mark user as "inactive" instead of deleting immediately
            leaver.inactive = true;
            
            // Set a timer to actually remove them if they don't return
            // Reduced grace period to 2s for faster "User Left" feedback while allowing refreshes
            leaver.leaveTimer = setTimeout(() => {
                 if (!rooms[room]) return; // Room might be gone
                 
                 // Check if user is still inactive
                 const currentIdx = rooms[room].users.findIndex(u => u.sessionId === leaver.sessionId);
                 
                 if (currentIdx !== -1 && rooms[room].users[currentIdx].inactive) {
                     // Confirm removal
                     console.log(`User ${leaver.name} timed out. Removing.`);
                     rooms[room].users.splice(currentIdx, 1);
                     
                     // Admin Reassignment
                     // If the leaver was the admin, promote the next available user IMMEDIATELY
                     if (rooms[room].admin === leaver.id) {
                        const newAdmin = rooms[room].users.find(u => !u.inactive) || rooms[room].users[0];
                        if (newAdmin) {
                            rooms[room].admin = newAdmin.id;
                            rooms[room].adminSessionId = newAdmin.sessionId;
                            
                            console.log(`Admin left. Promoted ${newAdmin.name} (${newAdmin.id})`);
                            
                            io.to(room).emit('admin_changed', { 
                                newAdminId: newAdmin.id, 
                                newAdminName: newAdmin.name 
                            });
                            
                            io.to(room).emit('chat_message', {
                                type: 'system',
                                content: `Admin left. ${newAdmin.name} is now the admin.`,
                                timestamp: new Date().toISOString()
                            });
                        } else {
                            // No users left? Room will be cleaned up/admin set to null
                            rooms[room].admin = null;
                        }
                     }
                     
                     io.to(room).emit('user_left', { 
                        userId: leaver.id, 
                        count: rooms[room].users.length,
                        admin: rooms[room].admin
                     });
                     
                     io.to(room).emit('chat_message', {
                        type: 'system',
                        content: `${leaver.name} left the room.`,
                        timestamp: new Date().toISOString()
                     });
                 }
            }, 2000); // 2 seconds grace period (fast enough for refresh, snappy for leaves)
        }
        
        // Don't emit 'user_left' yet!
        
        // Clean up empty rooms (if EVERYONE is inactive?)
        // We can keep the Room persistence logic separately, or rely on users array being empty eventually.
      }
    }
  });

  socket.on('set_password', ({ roomId, password }) => {
      // Validate Admin
      if (!rooms[roomId]) return;
      if (rooms[roomId].admin !== socket.id) {
          socket.emit('error', 'Only admin can set password');
          return;
      }
      
      // Validate format
      if (password && !/^\d{6}$/.test(password)) {
           socket.emit('error', 'Password must be exactly 6 digits');
           return;
      }
      
      rooms[roomId].password = password;
      
      io.to(roomId).emit('chat_message', {
          type: 'system',
          content: password ? 'Room is now password protected.' : 'Room password removed.',
          timestamp: new Date().toISOString()
      });
      
      // Sync state so clients know password status (and admin gets the saved PIN back)
      io.to(roomId).emit('sync_state', rooms[roomId]);
  });
  


  // --- Timer & Virtual Player Logic ---
  const updateRoomTimestamp = (room) => {
      if (room.playing && room.lastPlayTime) {
          const now = Date.now();
          const elapsed = (now - room.lastPlayTime) / 1000;
          room.timestamp += elapsed;
          room.lastPlayTime = now;
      }
  };

  const startRoomTimer = (roomId) => {
      const room = rooms[roomId];
      if (!room || !room.playing || !room.duration) return;
      
      // Clear existing
      if (room.timer) clearTimeout(room.timer);
      
      // Calculate remaining time
      updateRoomTimestamp(room); // Sync to now
      const remainingSeconds = room.duration - room.timestamp;
      
      // Buffer of 2 seconds to ensure clients finish first
      // Buffer of 2 seconds to ensure clients finish first
      let timeoutMs = (remainingSeconds + 2) * 1000;
      
      // Ensure we fire even if late
      if (timeoutMs < 100) timeoutMs = 100;

      console.log(`[AutoPlay] Timer set for room ${roomId} in ${Math.round(timeoutMs/1000)}s`);
      room.timer = setTimeout(() => {
          console.log(`[AutoPlay] Timer fired for room ${roomId}`);
          playNextVideo(roomId);
      }, timeoutMs);
      
      // Start Heartbeat
      startHeartbeat(roomId);
  };

  const stopRoomTimer = (room) => {
      if (room.timer) {
          clearTimeout(room.timer);
          room.timer = null;
      }
      stopHeartbeat(room);
      updateRoomTimestamp(room); // Save state
  };
  
  const startHeartbeat = (roomId) => {
      const room = rooms[roomId];
      if (!room) return;
      
      if (room.heartbeat) clearInterval(room.heartbeat);
      
      console.log(`[Heartbeat] Started for room ${roomId}`);
      // Force sync every 10 seconds
      room.heartbeat = setInterval(() => {
          if (!room.playing) {
              stopHeartbeat(room);
              return;
          }
          
          updateRoomTimestamp(room);
          
          // Broadcast absolute server time to force clients in line
          io.to(roomId).emit('sync_exact', { 
              time: room.timestamp, 
              playing: true 
          });
      }, 10000);
  };
  
  const stopHeartbeat = (room) => {
      if (room.heartbeat) {
           clearInterval(room.heartbeat);
           room.heartbeat = null;
      }
  };

  const playNextVideo = async (roomId) => {
      const room = rooms[roomId];
      console.log(`[PlayNext] Executing for room ${roomId}. Queue: ${room?.queue?.length}. AutoPlay: ${room?.autoPlayEnabled}`);
      
      if (!room) return;

      if (!room.queue || room.queue.length === 0) {
          // --- Auto-Play / Recommendation Logic ---
          if (room.autoPlayEnabled && room.videoId) {
             console.log(`[AutoPlay] Queue empty. Last Video ID: ${room.videoId}. Fetching recommendations...`);
             try {
                let sourceTitle = room.currentTitle;
                const lastVideoId = room.videoId;

                // 1. If we don't have title, try to fetch it
                if (!sourceTitle) {
                    console.log(`[AutoPlay] Title missing. Fetching metadata for ${lastVideoId}...`);
                    const currentVideo = await YouTube.getVideo(`https://www.youtube.com/watch?v=${lastVideoId}`)
                        .catch(e => {
                            console.warn(`[AutoPlay] Failed to get video info for ${lastVideoId}: ${e.message}`);
                            return null; 
                        });
                    if (currentVideo) sourceTitle = currentVideo.title;
                }

                let nextVideoToPlay = null;

                if (sourceTitle) {
                    // 2. Intelligent Search for "True Recommendations"
                    // Clean title to remove "Official Video", "Lyrics" to find similar vibes, not just same song.
                    let cleanTitle = sourceTitle
                        .replace(/(\(|\[).*(\)|\])/g, '') // Remove content in brackets (often junk)
                        .replace(/official\s+video/gi, '')
                        .replace(/lyrics/gi, '')
                        .replace(/ft\..*/i, '') 
                        .trim();

                    if (cleanTitle.length < 2) cleanTitle = sourceTitle; // Safety

                    console.log(`[AutoPlay] Context Search: "${cleanTitle}" (Derived from: "${sourceTitle}")`);
                    
                    // Search with limit 15 to get variety
                    const isMix = (t) => t.toLowerCase().includes('mix') || t.toLowerCase().includes('radio');
                    
                    // Search with limit 18 to get variety
                    // Append "similar songs" to guide YouTube towards recommendations (unless it's already a Mix)
                    const searchQuery = isMix(cleanTitle) ? cleanTitle : `${cleanTitle} similar songs`;
                    console.log(`[AutoPlay] Query: "${searchQuery}"`);

                    const related = await YouTube.search(searchQuery, { limit: 18, type: 'video' })
                         .catch(e => {
                             console.warn(`[AutoPlay] Search failed: ${e.message}`); 
                             return [];
                         });
                    
                    if (related && related.length > 0) {
                        // Filter 1: ID Check
                        let candidates = related.filter(v => v.id !== lastVideoId);
                        
                        // Filter 2: Smart Recommendation (Variety)
                        const distinctCandidates = candidates.filter(v => {
                            if (isMix(v.title)) return true; // Lofi/Mixes: Allow anything similar
                            
                            // Pop/Rock: Force Variety
                            // 1. Avoid exact same title (e.g. Lyrics version)
                            if (v.title.toLowerCase().includes(cleanTitle.toLowerCase())) return false;
                            
                            // 2. Avoid same artist (if known) to mimic Spotify "Radio"
                            if (room.currentArtist && v.channel && v.channel.name === room.currentArtist) return false;
                            
                            return true;
                        });
                        
                        // Prefer distinct, but fallback if empty
                        if (distinctCandidates.length > 0) candidates = distinctCandidates;

                        // Pick random from top 5 for variety
                        const poolSize = Math.min(candidates.length, 5);
                        const validNext = poolSize > 0 
                            ? candidates[Math.floor(Math.random() * poolSize)] 
                            : null;
                        
                        if (validNext) {
                                 id: validNext.id,
                                 title: validNext.title,
                                 artist: validNext.channel.name,
                                 duration: validNext.duration / 1000, 
                                 thumbnail: validNext.thumbnail?.url,
                                 addedBy: 'Auto-Play 📻'
                             };
                        }
                    }
                } else {
                     console.log('[AutoPlay] Could not determine source title. Stopping.');
                     io.to(roomId).emit('chat_message', { 
                         type: 'system', 
                         content: `⚠️ Auto-Play failed: unavailable video info.`,
                         timestamp: new Date().toISOString()
                     });
                }

                if (nextVideoToPlay) {
                     room.queue.push(nextVideoToPlay);
                     io.to(roomId).emit('chat_message', { 
                         type: 'system', 
                         content: `📻 Auto-playing: "${nextVideoToPlay.title}"`,
                         timestamp: new Date().toISOString()
                     });
                     
                     return playNextVideo(roomId);
                } else {
                    console.log('[AutoPlay] No valid related video found.');
                     io.to(roomId).emit('chat_message', { 
                         type: 'system', 
                         content: `⚠️ Auto-Play failed: no related videos found.`,
                         timestamp: new Date().toISOString()
                     });
                }

             } catch (err) {
                 console.error('[AutoPlay] Critical Error:', err);
                 io.to(roomId).emit('chat_message', { 
                     type: 'system', 
                     content: `⚠️ Auto-Play Error: ${err.message}`,
                     timestamp: new Date().toISOString()
                 });
             }
          }
          
          console.log(`[PlayNext] Stopping playback (Queue empty or AutoPlay disabled).`);
          room.playing = false;
          stopRoomTimer(room);
          io.to(roomId).emit('sync_action', { type: 'pause', sender: 'Server' });
          return;
      }

      const nextVideo = room.queue.shift();
      // ... (rest is same)
      console.log(`[PlayNext] Shifted video: ${nextVideo?.title} (${nextVideo?.id})`);
      
      room.videoId = nextVideo.id;
      // Fallback duration to 3mins if missing to prevent timer failure
      room.duration = nextVideo.duration || 180; 
      room.timestamp = 0;
      room.playing = true;
      room.lastPlayTime = Date.now();
      
      console.log(`[AutoPlay] Playing next: ${nextVideo.title} (${room.duration}s)`);
      
      // Update room state title so Auto-Play doesn't need to fetch it later
      room.currentTitle = nextVideo.title; room.currentArtist = nextVideo.artist; 

      // Broadcast change
      io.to(roomId).emit('sync_action', { 
          type: 'change_video', 
          payload: nextVideo.id, 
          sender: 'Queue' 
      });
      io.to(roomId).emit('queue_updated', room.queue);
      
      startRoomTimer(roomId);
  };


  // Sync events
  socket.on('sync_action', async ({ roomId, type, payload }) => {
    if (!rooms[roomId]) return;
    
    // Permission check
    if (rooms[roomId].admin !== socket.id) {
        console.warn(`[Server] Denied ${type} from non-admin ${socket.id}`);
        return;
    }
    
    const room = rooms[roomId];
    
    if (type === 'play') {
        room.playing = true;
        room.lastPlayTime = Date.now();
        startRoomTimer(roomId);
        io.to(roomId).emit('sync_action', { type: 'play', sender: socket.id });
    }
    
    if (type === 'pause') {
        console.log(`[Server] PAUSE processed for room ${roomId}. Stopping timer.`);
        
        stopRoomTimer(room);
        room.playing = false;
        
        // Broadcast pause to EVERYONE (including sender)
        io.to(roomId).emit('sync_action', { type: 'pause', sender: socket.id });
    }
    
    if (type === 'seek') {
        updateRoomTimestamp(room); // Commit current interval
        // Payload can be number or { time, playing }
        const newTime = typeof payload === 'object' ? payload.time : payload;
        room.timestamp = newTime;  // Set new time
        if (room.playing) {
            room.lastPlayTime = Date.now(); // Reset interval start
            startRoomTimer(roomId); // Restart timer
        }
        
        // Broadcast seek to EVERYONE
        io.to(roomId).emit('sync_action', { type: 'seek', payload, sender: socket.id });
    }
    
    // Broadcast other actions normally if any (like change_video is handled elsewhere)
    
    if (type === 'change_video') {
       stopRoomTimer(room);
       room.videoId = payload;
       room.playing = true;
       room.timestamp = 0;
       
       try {
           const videoInfo = await YouTube.getVideo(`https://www.youtube.com/watch?v=${payload}`);
           room.duration = videoInfo.duration / 1000;
           room.currentTitle = videoInfo.title;
           room.currentArtist = videoInfo.channel.name;
           console.log(`[Manual Play] Set title: "${room.currentTitle}", Artist: "${room.currentArtist}", Duration: ${room.duration}s`);
       } catch (e) {
           console.error(`[Manual Play] Metadata fetch failed:`, e.message);
           room.duration = 0;
           room.currentTitle = payload;
       }
       
       room.lastPlayTime = Date.now();
       startRoomTimer(roomId);
       io.to(roomId).emit('sync_action', { type: 'change_video', payload, sender: socket.id });
    }
    
    // Broadcast other actions normally if any (like change_video is handled elsewhere)
    socket.to(roomId).emit('sync_action', { type, payload, sender: socket.id });
  });

  // Advanced Resync Protocol
  socket.on('request_sync', (roomId) => {
     if (!rooms[roomId]) return;
     // Server Authority Mode: Send server's calculated timestamp instead of asking Admin
     // This aligns everyone to the Server's Virtual Player
     const room = rooms[roomId];
     updateRoomTimestamp(room); // Update to current moment
     
     socket.emit('sync_exact', { 
         time: room.timestamp, 
         playing: room.playing 
     });
  });

  // Admin reports time (Optional now, but good for drift correction)
  socket.on('time_report', ({ requesterId, time, playing }) => {
      // If we keep Admin-Authority for precision, we can use this to correct Server drift
      // But for "Server Auto-Play", Server must be Authority eventually.
      // Let's stick to Server Authority for 'request_sync' above to ensure consistency with Timer.
  });

  socket.on('chat_message', ({ roomId, message, image }) => {
     // ... (unchanged validation)
     const room = rooms[roomId];
     const user = room?.users.find(u => u.id === socket.id);
     
     if (user) {
         if (user.mutedUntil && user.mutedUntil > Date.now()) {
             socket.emit('error', 'You are currently muted.');
             return;
         }
         
         const name = user.name;
         // Broadcast image if present (Socket.IO handles large payloads automatically mostly, but compression is key on client)
         io.to(roomId).emit('chat_message', { 
             userId: socket.id, 
             name, 
             message, 
             image, // Add image payload
             timestamp: new Date().toISOString() 
         });
     }
  });

  // ... (Admin Mgmt handlers unchanged) ...
  // ... (grant_admin, kick_user, get_state) ...
  socket.on('grant_admin', ({ roomId, targetUserId }) => { /* ... */ 
      if (!rooms[roomId]) return;
      if (rooms[roomId].admin !== socket.id) return;
      const targetUser = rooms[roomId].users.find(u => u.id === targetUserId);
      if (!targetUser) return;
      rooms[roomId].admin = targetUserId;
      rooms[roomId].adminSessionId = targetUser.sessionId;
      io.to(roomId).emit('admin_changed', { newAdminId: targetUserId, newAdminName: targetUser.name });
  });

  socket.on('kick_user', ({ roomId, targetUserId }) => { /* ... */
      if (!rooms[roomId]) return;
      if (rooms[roomId].admin !== socket.id) return;
      if (targetUserId === socket.id) return;
      const targetUser = rooms[roomId].users.find(u => u.id === targetUserId);
      if (!targetUser) return;
      rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== targetUserId);
      io.to(targetUserId).emit('kicked', { roomId, reason: 'Removed by admin' });
      io.to(roomId).emit('chat_message', { type: 'system', content: `${targetUser.name} kicked.`, timestamp: new Date().toISOString() });
      const targetSocket = io.sockets.sockets.get(targetUserId);
      if (targetSocket) targetSocket.leave(roomId);
      io.to(roomId).emit('user_left', { userId: targetUserId, count: rooms[roomId].users.length, admin: rooms[roomId].admin, kicked: true });
  });

  socket.on('get_state', (roomId) => {
      if (!rooms[roomId]) return;
      // Update TS before sending
      updateRoomTimestamp(rooms[roomId]);
      socket.emit('sync_state', {
          videoId: rooms[roomId].videoId,
          playing: rooms[roomId].playing,
          timestamp: rooms[roomId].timestamp,
          users: rooms[roomId].users,
          password: rooms[roomId].password,
          queue: rooms[roomId].queue || [],
          admin: rooms[roomId].admin, 
          adminSessionId: rooms[roomId].adminSessionId,
          autoPlayEnabled: rooms[roomId].autoPlayEnabled || false
      });
  });

  socket.on('toggle_autoplay', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;
      if (room.admin !== socket.id) return;
      
      room.autoPlayEnabled = !room.autoPlayEnabled;
      
      // Notify all
      io.to(roomId).emit('chat_message', {
          type: 'system',
          content: `Admin ${room.autoPlayEnabled ? 'enabled' : 'disabled'} Auto-Play recommended mode. ✨`,
          timestamp: new Date().toISOString()
      });
      
      // If enabled and room is currently stopped (but has played before), kickstart it!
      if (room.autoPlayEnabled && !room.playing && room.videoId) {
          console.log(`[AutoPlay] Kickstarting playback for room ${roomId}`);
          playNextVideo(roomId);
      }
      
      // Send updated state to everyone so UI updates
      const statePayload = {
          videoId: room.videoId,
          playing: room.playing,
          timestamp: room.timestamp,
          users: room.users,
          password: room.password,
          queue: room.queue || [],
          admin: room.admin,
          adminSessionId: room.adminSessionId,
          autoPlayEnabled: room.autoPlayEnabled
      };
      io.to(roomId).emit('sync_state', statePayload);
  });


  // --- Video Queue Handlers ---

  socket.on('queue_add', async ({ roomId, video }) => {
      console.log(`[Queue] Adding video to room ${roomId}:`, video?.title);
      if (!rooms[roomId]) return;
      
      // Ensure queue exists
      if (!rooms[roomId].queue) rooms[roomId].queue = [];
      
      // If duration is missing, fetch it!
      if (!video.duration || !video.title) {
          try {
              console.log(`[Queue] Fetching metadata for ${video.id || 'unknown ID'}`);
              const result = await YouTube.getVideo(`https://www.youtube.com/watch?v=${video.id}`);
              if (result) {
                  video.title = video.title || result.title;
                  video.duration = result.duration / 1000; // youtube-sr returns ms
                  video.thumbnail = video.thumbnail || result.thumbnail?.url;
                  video.author = result.channel ? result.channel.name : 'Unknown';
                  console.log(`[Queue] Fetched duration: ${video.duration}s`);
              }
          } catch (err) {
              console.error(`[Queue] Metadata fetch failed:`, err);
              // Fallback default? 3 minutes?
              if (!video.duration) video.duration = 180;
          }
      }

      rooms[roomId].queue.push(video);
      
      console.log(`[Queue] Updated queue length: ${rooms[roomId].queue.length}`);
      io.to(roomId).emit('queue_updated', rooms[roomId].queue);
      
      // Notify Chat
      const isToActionAdmin = (rooms[roomId].admin === socket.id);
      const adderName = isToActionAdmin ? 'Admin' : (video.addedBy || 'User');
      
      io.to(roomId).emit('chat_message', {
          type: 'system',
          content: `${adderName} added "${video.title}" to queue.`,
          timestamp: new Date().toISOString()
      });
  });

  socket.on('request_queue_add', async ({ roomId, video }) => {
      if (!rooms[roomId]) return;
      
      const adminId = rooms[roomId].admin;
      if (adminId) {
           // ... (metadata fetch logic)
           // If duration is missing, fetch it!
          if (!video.duration || !video.title) {
              try {
                  console.log(`[Queue] Fetching metadata for request ${video.id}`);
                  const result = await ytSearch({ videoId: video.id });
                  if (result) {
                      video.title = video.title || result.title;
                      video.duration = result.seconds;
                      video.thumbnail = video.thumbnail || result.thumbnail;
                      video.author = result.author ? result.author.name : 'Unknown';
                  }
              } catch (err) {
                  console.error(`[Queue] Metadata fetch failed:`, err);
                  if (!video.duration) video.duration = 180; 
              }
          }
          io.to(adminId).emit('admin_queue_request', { video });
      }
  });

  socket.on('resolve_queue_request', ({ roomId, video, approved }) => {
      if (!rooms[roomId]) return;
      if (rooms[roomId].admin !== socket.id) return; 
      
      if (approved) {
          if (!rooms[roomId].queue) rooms[roomId].queue = [];
          rooms[roomId].queue.push(video);
          io.to(roomId).emit('queue_updated', rooms[roomId].queue);
          io.to(roomId).emit('chat_message', {
              type: 'system',
              content: `${video.addedBy} added "${video.title}" to queue (Approved).`,
              timestamp: new Date().toISOString()
          });
      }
  });

  socket.on('queue_remove', ({ roomId, index }) => {
      if (!rooms[roomId]) return;
      if (rooms[roomId].admin !== socket.id) return;
      if (index >= 0 && index < rooms[roomId].queue.length) {
          const removedVideo = rooms[roomId].queue[index];
          rooms[roomId].queue.splice(index, 1);
          io.to(roomId).emit('queue_updated', rooms[roomId].queue);
          
          io.to(roomId).emit('chat_message', {
              type: 'system',
              content: `Admin removed "${removedVideo.title}" from queue.`,
              timestamp: new Date().toISOString()
          });
      }
  });

  socket.on('play_next', ({ roomId, endedVideoId }) => {
     // ... (unchanged)
      if (!rooms[roomId]) return;
      
      console.log(`[PlayNext] Request for room ${roomId}. Reported ended: ${endedVideoId}, Current: ${rooms[roomId].videoId}`);
      
      // Allow if Admin OR if the reported ended video matches current (crowd-sourced auto-play)
      const isCurrentVideo = endedVideoId && rooms[roomId].videoId === endedVideoId;
      
      if (rooms[roomId].admin !== socket.id && !isCurrentVideo) {
          console.log(`[PlayNext] Unauthorized or Stale request`);
          return; // Unauthorized skip
      }
      
      playNextVideo(roomId);
  });

  socket.on('queue_reorder', ({ roomId, fromIndex, toIndex }) => {
      if (!rooms[roomId]) return;
      if (rooms[roomId].admin !== socket.id) return; 
      const queue = rooms[roomId].queue;
      if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) return;
      
      const [movedItem] = queue.splice(fromIndex, 1);
      queue.splice(toIndex, 0, movedItem);
      
      io.to(roomId).emit('queue_updated', rooms[roomId].queue);
      
      io.to(roomId).emit('chat_message', {
          type: 'system',
          content: `Admin moved "${movedItem.title}" to #${toIndex + 1}.`,
          timestamp: new Date().toISOString()
      });
  });
});


// Serve static files from the build directory
app.use(express.static(path.join(__dirname, 'dist')));

// SPA Catch-all: specific routes should be API, everything else is React
app.get('*', (req, res) => {
  // Don't intercept API routes
  if (req.url.startsWith('/api')) return res.status(404).json({ error: 'Not Found' });
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
