import React, { useState, useEffect, useRef } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { VideoSearch } from './VideoSearch';
import { useSocket } from '../hooks/useSocket';
import { useKeepAlive } from '../hooks/useKeepAlive';
import { Send, Users, Film, MessageSquare, MonitorPlay, Crown, Edit2, Search as SearchIcon, X, Link as LinkIcon, UserCog, Lock, Key, Share2, LogOut, Check, ListPlus, PlayCircle, ChevronUp, ChevronDown, SkipForward, Copy, Smile, Image as ImageIcon, Paperclip, AlertTriangle, UserX, Sparkles, Loader2 } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import imageCompression from 'browser-image-compression';
import QRCode from 'react-qr-code';
import { v4 as uuidv4 } from 'uuid';

export function Room({ roomId, username, initialPassword, onLeave }) {
  // Session management
  const [sessionData] = useState(() => {
    // Try to get existing session for this room
    const stored = localStorage.getItem(`localtube_session_${roomId}`);
    if (stored) {
      try {
        const session = JSON.parse(stored);
        return session;
      } catch (e) {
        console.error('Failed to parse stored session:', e);
      }
    }
    return { sessionId: uuidv4(), username: null };
  });

  const sessionId = sessionData.sessionId;
  const savedUsername = sessionData.username;
  const savedPassword = sessionData.password; // Retrieve saved password
  const effectiveUsername = savedUsername || username;

  // Init password from prop (if passed from creation)
  const [password, setPassword] = useState(initialPassword || '');
  
  // Separate state for socket connection password to avoid reconnect loops on typing
  // prioritized: savedPassword > initialPassword
  const [socketPassword, setSocketPassword] = useState(savedPassword || initialPassword || '');
  const [inputPassword, setInputPassword] = useState('');

  const { socket, isConnected, adminId } = useSocket(roomId, effectiveUsername, sessionId, socketPassword);
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState('');
  const [videoInput, setVideoInput] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(username);
  const [showSearch, setShowSearch] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [showUserList, setShowUserList] = useState(false);
  
  // Kick State
  const [showKickDialog, setShowKickDialog] = useState(false);
  // Duplicate Handling
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  // Admin Promotion Dialog State
  const [showAdminPromotedDialog, setShowAdminPromotedDialog] = useState(false);


  const [unreadCount, setUnreadCount] = useState(0); // Added missing state
  
  // Password State
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showAdminPasswordDialog, setShowAdminPasswordDialog] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showQueueOption, setShowQueueOption] = useState(false); // New Modal State
  const [linkCopied, setLinkCopied] = useState(false);
  const [qrCopied, setQrCopied] = useState(false); // Added for feedback
  const [pendingVideo, setPendingVideo] = useState(null); // Video waiting for decision
  const [newRoomPassword, setNewRoomPassword] = useState('');
  const [currentRoomPassword, setCurrentRoomPassword] = useState(null);
  
  // Generic Confirmation Dialog State
  const [confirmationDialog, setConfirmationDialog] = useState(null); // { title, message, onConfirm, confirmText, type: 'danger'|'primary' }

  // Search State - lifted to persist across dialog close/open
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showQueueDialog, setShowQueueDialog] = useState(false); // Queue Dialog State
  const [urlInputError, setUrlInputError] = useState(''); // URL validation error
  const [notification, setNotification] = useState(null); // Toast Notification { message, type }

  
  // Video State
  const [currentVideoId, setCurrentVideoId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]); // Queue State
  const [pendingRequest, setPendingRequest] = useState(null); // Admin: Request to approve
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'queue'
  const [isSkipping, setIsSkipping] = useState(false); // Skip loading state

  // Reset skipping state when video changes
  useEffect(() => {
    setIsSkipping(false);
  }, [currentVideoId]);

  const [viewingImage, setViewingImage] = useState(null); // Image Viewer State

  const handleSkip = () => {
    if (isSkipping) return;
    setIsSkipping(true);
    socket?.emit('play_next', { roomId });
    // Safety timeout: Reset after 3s if server doesn't respond
    setTimeout(() => setIsSkipping(false), 3000);
  };
  
  const messagesEndRef = useRef(null);
  const userListRef = useRef(null);
  const passwordTimerRef = useRef(null);
  const showMobileChatRef = useRef(false); // Added missing ref

  const isAdmin = socket?.id && adminId === socket.id;

   // Derived state for display name
   const currentUser = users.find(u => u.id === socket?.id);
   const displayName = currentUser ? currentUser.name : effectiveUsername;
   // Mobile State
   const [showMobileChat, setShowMobileChat] = useState(false);
   
   // Chat Enhancements State
   const [showEmojiPicker, setShowEmojiPicker] = useState(false);
   const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);
   const fileInputRef = useRef(null);

   const onEmojiClick = (emojiObject) => {
       setMsgInput(prev => prev + emojiObject.emoji);
       // Keep picker open or close? User preference. Let's keep it open for multiple emojis.
   };

   const handleImageUpload = async (event) => {
       const file = event.target.files[0];
       if (!file) return;

       // Compression Options
       const options = {
           maxSizeMB: 0.8, // 800KB Limit for Socket.io
           maxWidthOrHeight: 1024,
           useWebWorker: true
       };

       try {
           console.log(`[ImageUpload] Original size: ${file.size / 1024 / 1024} MB`);
           const compressedFile = await imageCompression(file, options);
           console.log(`[ImageUpload] Compressed size: ${compressedFile.size / 1024 / 1024} MB`);

           // Convert to Base64
           const reader = new FileReader();
           reader.readAsDataURL(compressedFile);
           reader.onloadend = () => {
               const base64data = reader.result;
               // Emit
               if (socket) {
                   socket.emit('chat_message', {
                       roomId, 
                       message: '', // Empty text
                       image: base64data 
                   });
                   // Close mobile keyboard/ui if needed
               }
           };
       } catch (error) {
           console.error('[ImageUpload] Compression Failed:', error);
       }
       // Reset input
       if (fileInputRef.current) fileInputRef.current.value = '';
   };
    
    // Attempt to keep browser alive efficiently
    useKeepAlive(isPlaying);

    useEffect(() => {
         showMobileChatRef.current = showMobileChat;
         if (showMobileChat) {
            setUnreadCount(0);
        }
   }, [showMobileChat]);

   // Tab Title Notification
   useEffect(() => {
        document.title = unreadCount > 0 ? `(${unreadCount}) OceanTube` : 'OceanTube';
   }, [unreadCount]);
  
   // Clear unread on focus
   useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                setUnreadCount(0);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
   }, []);





  // Save session to localStorage when joining or name changes
  useEffect(() => {
    if (socket?.id && roomId) {
      const sessionData = {
        roomId,
        username: displayName,
        sessionId,
        socketId: socket.id,
        password: socketPassword
      };
      localStorage.setItem(`localtube_session_${roomId}`, JSON.stringify(sessionData));
    }
  }, [socket?.id, roomId, displayName, sessionId, socketPassword]);

  const videoIdRef = useRef(null);
  useEffect(() => { videoIdRef.current = currentVideoId; }, [currentVideoId]);

  useEffect(() => {
    if (!socket) return;

    socket.on('sync_state', (state) => {
        console.log('Room Logic: sync_state received', state);
        setUsers(state.users);

        // State Resurrection (Server Restart Recovery)
        // If we are admin, have a video locally, but server says null... restore it!
        // We check if WE are the admin in the NEW state (or existing state)
        if (state.admin === socket.id && !state.videoId && videoIdRef.current) {
             console.log('[Room] Server state empty (Restart detected?). Restoring video:', videoIdRef.current);
             socket.emit('sync_action', { 
                 roomId, 
                 type: 'change_video', 
                 payload: videoIdRef.current 
             });
        }
        
        if (state.videoId) {
            console.log('Room Logic: Updating videoId to', state.videoId);
            setCurrentVideoId(state.videoId);
        }
        if (state.playing !== undefined) setIsPlaying(state.playing);
        
        // Update local password state (for admin UI)
        if (state.password !== undefined) {
             setCurrentRoomPassword(state.password);
        }

        if (state.queue) setQueue(state.queue);
        if (state.autoPlayEnabled !== undefined) setAutoPlayEnabled(state.autoPlayEnabled);
        
        // If we receive state, checks if we are in the user list (authenticated)
        // This prevents race conditions where we get state but still need password
        const me = state.users.find(u => u.id === socket.id);
        if (me) {
            if (passwordTimerRef.current) clearTimeout(passwordTimerRef.current);
            setShowPasswordDialog(false);
        }
    });

    socket.on('queue_updated', (newQueue) => {
        setQueue(newQueue);
    });
    
    socket.on('sync_action', ({ type, payload, sender }) => {
        console.log('Room Logic: sync_action received', { type, payload, sender });
        if (type === 'change_video') {
            console.log('Room Logic: Changing video to', payload);
            setCurrentVideoId(payload);
            setIsPlaying(true);
        } else if (type === 'play') {
            setIsPlaying(true);
        } else if (type === 'pause') {
            setIsPlaying(false);
        } else if (type === 'seek') {
            // Check if seek payload includes playing state
            if (typeof payload === 'object' && payload.playing !== undefined) {
                setIsPlaying(payload.playing);
            }
        }
    });
    
    socket.on('user_joined', ({ user, count }) => {
        setUsers(prev => {
            if (prev.find(u => u.id === user.id)) return prev;
            return [...prev, user];
        });
        setMessages(prev => [...prev, { 
            type: 'system', 
            content: `${user.name} joined.`, 
            id: uuidv4(),
            timestamp: new Date().toISOString()
        }]);
        
        // Admin: Check server state consistency to Resurrect video if needed
        if (socket.id === adminId) {
             console.log('[Room] New user joined. Checking server state consistency...');
             socket.emit('get_state', roomId);
        }
    });

    socket.on('user_left', ({ userId, count }) => {
        setUsers(prev => prev.filter(u => u.id !== userId));
    });

    socket.on('user_updated', (updatedUser) => {
         setUsers(prev => prev.map(u => 
             (u.sessionId === updatedUser.sessionId || u.id === updatedUser.id) ? updatedUser : u
         ));
    });

    socket.on('admin_changed', ({ newAdminId, newAdminName }) => {
        setMessages(prev => [...prev, { 
            type: 'system', 
            content: `${newAdminName} is now the admin.`, 
            id: uuidv4(),
            timestamp: new Date().toISOString()
        }]);
        
        // Show dialog if WE became the admin
        if (newAdminId === socket.id) {
            setShowAdminPromotedDialog(true);
        }
    });

    socket.on('kicked', ({ reason }) => {
        setKickReason(reason);
        setShowKickDialog(true);
    });

    socket.on('password_required', () => {
        // If we have a saved password that we are sending, don't show dialog yet
        if (socketPassword && socketPassword.length > 0) {
            console.log('Room Logic: Silencing password_required dialog as we have a stored password.');
            return;
        }

        // Debounce showing the dialog to avoid flash if sync_state comes right after
        if (passwordTimerRef.current) clearTimeout(passwordTimerRef.current);
        passwordTimerRef.current = setTimeout(() => {
             setShowPasswordDialog(true);
             setPasswordError('');
        }, 500);
    });

    socket.on('invalid_password', ({ message }) => {
        setShowPasswordDialog(true);
        setPasswordError(message);
    });

    socket.on('duplicate_session', () => {
        console.warn('Duplicate session detected. Disconnecting.');
        setShowDuplicateDialog(true);
        socket.disconnect();
    });

    socket.on('admin_queue_request', ({ video }) => {
        setPendingRequest(video);
        // Optional: Play a sound
    });

    socket.on('chat_message', (msg) => {
        setMessages(prev => [...prev, { type: 'user', ...msg, id: uuidv4() }]);
        
        // Notification Logic
        if (document.hidden || !showMobileChatRef.current) {
            setUnreadCount(prev => prev + 1);
        }
    });

    return () => {
        if (passwordTimerRef.current) clearTimeout(passwordTimerRef.current);
        socket.off('user_joined');
        socket.off('user_left');
        socket.off('user_updated');
        socket.off('admin_changed');
        socket.off('kicked');
        socket.off('password_required');
        socket.off('invalid_password');
        socket.off('chat_message');
        socket.off('sync_state');
        socket.off('sync_action');
        socket.off('queue_updated');
    };
  }, [socket, adminId]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close user list dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userListRef.current && !userListRef.current.contains(event.target)) {
        setShowUserList(false);
      }
    };

    if (showUserList) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserList]);

  // Prevent accidental leave
  useEffect(() => {
      const handleBeforeUnload = (e) => {
          e.preventDefault();
          e.returnValue = ''; // Trigger browser confirmation
          return '';
      };
      
      window.addEventListener('beforeunload', handleBeforeUnload);
      
      // Force sync on visibility return
      const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible' && socket) {
              console.log('[Room] Tab visible, forcing sync...');
              socket.emit('request_sync', roomId);
          }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
          window.removeEventListener('beforeunload', handleBeforeUnload);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
  }, [socket, roomId]);

  // Helper to format remaining mute time
  
  const sendMessage = (e) => {
    e?.preventDefault();
    if (!socket) return;
    
    if (msgInput.trim()) {
      socket.emit('chat_message', { roomId, message: msgInput });
      setMsgInput('');
    }
  };

  const changeVideo = (e) => {
    e.preventDefault();
    if (!videoInput.trim()) return;
    
    // Validate YouTube URL and extract video ID
    const getYouTubeID = (url) => {
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
      const match = url.match(regExp);
      return (match && match[2].length === 11) ? match[2] : null;
    };
    
    const videoId = getYouTubeID(videoInput.trim());
    
    if (!videoId) {
      setUrlInputError('Invalid YouTube URL. Please enter a valid YouTube link.');
      return;
    }
    
    // Optimistic Update
    setCurrentVideoId(videoId);
    setIsPlaying(true);
    
    socket?.emit('sync_action', { roomId, type: 'change_video', payload: videoId });
    setVideoInput('');
    setUrlInputError('');
    setShowUrlInput(false);
  };

  const handleVideoSelect = (video) => {
    // If user is admin, offer to queue
    if (isAdmin) {
        setPendingVideo(video);
        setShowQueueOption(true);
    } else {
        // Non-admin request
        addToQueue(video);
    }
    // Don't close search - let user browse more results or close manually
  };

  const addToQueue = (video) => {
     // video: { id, title, thumbnail }
     if (socket) {
         if (isAdmin) {
             socket.emit('queue_add', { 
                 roomId, 
                 video: { ...video, addedBy: displayName } 
             });
         } else {
              socket.emit('request_queue_add', {
                  roomId,
                  video: { ...video, addedBy: displayName }
              });
              setNotification({ message: 'Request sent to Admin for approval.', type: 'success' });
              setTimeout(() => setNotification(null), 3000);
          }
      }
  };

  const removeFromQueue = (index) => {
     if (socket && isAdmin) {
         socket.emit('queue_remove', { roomId, index });
     }
  };

  const moveQueueItem = (index, direction) => {
      if (!isAdmin || !socket) return;
      
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      
      // Validate bounds
      if (newIndex < 0 || newIndex >= queue.length) return;
      
      // Emit reorder event to server
      socket.emit('queue_reorder', {
          roomId,
          fromIndex: index,
          toIndex: newIndex
      });
  };
  
  const handleRename = (e) => {
      e.preventDefault();
      if (newName.trim()) {
          socket?.emit('update_name', { roomId, name: newName });
          setIsRenaming(false);
      }
  };
  
  const handleGrantAdmin = (userId) => {
      setTimeout(() => {
          setConfirmationDialog({
              title: 'Grant Admin',
              message: 'Grant admin privileges to this user?',
              confirmText: 'Grant',
              type: 'primary',
              onConfirm: () => {
                  socket?.emit('grant_admin', { roomId, targetUserId: userId });
                  setConfirmationDialog(null);
              }
          });
          setShowUserList(false);
      }, 0);
  };
   
  const handleKickUser = (userId) => {
      setTimeout(() => {
          setConfirmationDialog({
              title: 'Kick User',
              message: 'Remove this user from the room?',
              confirmText: 'Kick',
              type: 'danger',
              onConfirm: () => {
                  socket?.emit('kick_user', { roomId, targetUserId: userId });
                  setConfirmationDialog(null);
              }
          });
          setShowUserList(false);
      }, 0);
  };
   
  const handleSetPassword = () => {
       setShowAdminPasswordDialog(true);
       setNewRoomPassword(currentRoomPassword || '');
       setShowUserList(false);
  };

  const confirmSetPassword = (e) => {
       e.preventDefault();
       if (newRoomPassword && !/^\d{6}$/.test(newRoomPassword)) return; // Simple valid check
       
       socket?.emit('set_password', { roomId, password: newRoomPassword || null }); // Empty means remove
       setShowAdminPasswordDialog(false);
  };

  const onPlay = () => {
      if (isAdmin) {
          socket?.emit('sync_action', { roomId, type: 'play' });
      } else {
          socket?.emit('request_sync', roomId);
      }
  };

  const onPause = () => {
      console.log('[Room] onPause called. Admin:', isAdmin);
      if (isAdmin) {
          console.log('[Room] Emitting pause action');
          socket?.emit('sync_action', { roomId, type: 'pause' });
      }
  };

  if (showDuplicateDialog) {
       return (
           <div className="modal-overlay">
               <div className="modal-box">
                   <div style={{ color: '#ef4444', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                       <Users size={48} />
                   </div>
                   <h2 className="modal-title">Duplicate Session</h2>
                   <p className="modal-description">
                       You are already connected to this room in another tab or device.
                       <br/><br/>
                       Please use the existing tab, or close it before joining here.
                   </p>
                   <button className="btn-primary" onClick={() => {
                           window.location.href = '/'; // Leaving redirects to home
                       }} style={{ width: '100%' }}>
                       OK
                   </button>
               </div>
           </div>
       );
  }

  if (showAdminPromotedDialog) {
      return (
          <div className="modal-overlay">
              <div className="modal-box">
                  <Crown className="modal-icon" style={{ color: 'var(--accent-primary)' }} />
                  <h2 className="modal-title">You are now Admin</h2>
                  <p className="modal-description">
                      You have been granted admin privileges. You can now control video playback and manage users.
                  </p>
                  <button className="btn-primary" onClick={() => setShowAdminPromotedDialog(false)} style={{ width: '100%' }}>
                      Awesome!
                  </button>
              </div>
          </div>
      );
  }

  if (showKickDialog) {
      return (
          <div className="modal-overlay">
              <div className="modal-box">
                  <UserX className="modal-icon" style={{ color: '#ef4444' }} />
                  <h2 className="modal-title">You have been kicked</h2>
                  <p className="modal-description">{kickReason}</p>
                  <button className="btn-primary" onClick={() => {
                          setShowKickDialog(false);
                          localStorage.removeItem(`localtube_session_${roomId}`);
                          onLeave();
                      }} style={{ width: '100%' }}>
                      Return to Home
                  </button>
              </div>
          </div>
      );
  }

       if (showPasswordDialog) {
           return (
               <div className="modal-overlay">
                   <div className="modal-box">
                       <Lock className="modal-icon" style={{ color: 'var(--accent-primary)' }} />
                       <h2 className="modal-title">Room Locked</h2>
                       <p className="modal-description" style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                           Please enter the 6-digit PIN to join.
                       </p>
                       
                       <form onSubmit={(e) => { 
                           e.preventDefault(); 
                           if (inputPassword.length === 6) setSocketPassword(inputPassword);
                       }} style={{ width: '100%' }}>
                           <input 
                               type="text" placeholder="000000" maxLength={6} value={inputPassword}
                               onChange={e => {
                                   const val = e.target.value.replace(/\D/g, '');
                                   setInputPassword(val);
                                   setPasswordError('');
                               }}
                               className="styled-input"
                               style={{ 
                                   fontSize: '2rem', textAlign: 'center', letterSpacing: '8px', 
                                   marginBottom: '1rem', border: `1px solid ${passwordError ? '#ef4444' : 'var(--border-color)'}`
                               }}
                               autoFocus
                           />
                           {passwordError && (
                               <div style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem' }}>{passwordError}</div>
                           )}
                           <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                               <button type="button" className="btn-secondary" onClick={() => {
                                       localStorage.removeItem(`localtube_session_${roomId}`);
                                       onLeave();
                                   }} style={{ flex: 1 }}>
                                   Cancel
                               </button>
                               <button type="submit" className="btn-primary" disabled={inputPassword.length !== 6} style={{ flex: 1, opacity: inputPassword.length !== 6 ? 0.5 : 1 }}>
                                   Join Room
                               </button>
                           </div>
                       </form>
                   </div>
               </div>
           );
       }



  return (
    <div className="room-container">
      <header className="room-header">
        <div className="logo">
           <MonitorPlay className="icon-logo" />
           <span>OceanTube</span>
        </div>
        <div className="room-info">

           
           <div className="room-user-info">
           {isAdmin && (
             <span className="badge" style={{ backgroundColor: '#4f46e5', color: 'white' }}>
               <Crown size={14} /> Admin
             </span>
           )}
           {isRenaming ? (
               <form onSubmit={handleRename} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                   <input 
                     value={newName} 
                     onChange={e => setNewName(e.target.value)}
                     className="rename-input"
                     style={{ 
                         background: 'var(--bg-tertiary)', 
                         border: '1px solid var(--accent-primary)', 
                         color: 'white', 
                         padding: '0.2rem 0.5rem', 
                         borderRadius: '4px',
                         fontSize: '0.85rem'
                     }}
                     autoFocus
                     // Removed onBlur to prevent accidental closing before clicking save
                   />
                   <button type="submit" className="btn-icon" style={{ padding: '0.2rem', color: '#4ade80' }} title="Save Name" aria-label="Save Name"><Check size={16}/></button>
               </form>
            ) : (
               <span 
                   className="badge" 
                   onClick={() => { setNewName(displayName); setIsRenaming(true); }}
                   style={{ 
                       borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)', borderWidth: '1px', borderStyle: 'solid',
                       cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                   }}
                   title="Click to edit name"
               >
                  <Users size={14} /> {displayName}
                  <Edit2 size={10} style={{ opacity: 0.5 }} />
               </span>
            )}
           
           <div className="user-controls" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ position: 'relative' }} ref={userListRef}>
                    <span className="badge" onClick={(e) => { e.stopPropagation(); setShowUserList(!showUserList); }} style={{ cursor: 'pointer' }} title="View users">
                      <Users size={14} /> {users.length} Online
                    </span>
                    
                    {showUserList && (
                        <div className="user-list-dropdown">
                            <div className="user-list-header">Online Users</div>
                            {users
                                .sort((a, b) => {
                                    // Admin always at the top
                                    if (a.id === adminId) return -1;
                                    if (b.id === adminId) return 1;
                                    return 0;
                                })
                                .map(user => (
                                <div key={user.id} className="user-list-item">
                                    <div className="user-info">
                                        <Users size={14} />
                                        <span>{user.name}</span>
                                        {user.id === adminId && <Crown size={12} style={{ color: '#4f46e5' }} />}
                                    </div>
                                    {isAdmin && user.id !== socket?.id && (
                                        <div className="user-actions">
                                            {user.id !== adminId && (
                                                <button className="btn-icon" onClick={(e) => { e.stopPropagation(); handleGrantAdmin(user.id); }} title="Make Admin" aria-label={`Grant admin to ${user.name}`}>
                                                    <UserCog size={14} />
                                                </button>
                                            )}
                                            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); handleKickUser(user.id); }} title="Kick User" style={{ color: '#ef4444' }} aria-label={`Kick ${user.name}`}>
                                                <LogOut size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {isAdmin && (
                                <div style={{ padding: '0.5rem', borderTop: '1px solid var(--border-color)', marginTop: '0.5rem' }}>
                                    <button className="btn-secondary" style={{ width: '100%', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={(e) => { e.stopPropagation(); handleSetPassword(); }}>
                                        <Key size={12} /> Set Room PIN
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
           </div>

           <div className="room-id">
              ID: {roomId}
           </div>

           <button 
               className="btn-secondary desktop-only-btn"
               onClick={() => setShowShareDialog(true)}
               style={{ 
                   padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                   fontSize: '0.9rem', marginRight: '0.5rem', cursor: 'pointer'
               }}
               title="Share Room"
               aria-label="Share room link and QR code"
           >
               <Share2 size={16} />
               <span>Share</span>
           </button>

           <button 
               className="btn-danger desktop-only-btn" 
               onClick={() => {
                  setConfirmationDialog({
                      title: 'Leave Room',
                      message: 'Are you sure you want to leave the room?',
                      confirmText: 'Leave',
                      type: 'danger',
                      onConfirm: () => {
                          localStorage.removeItem(`localtube_session_${roomId}`);
                          onLeave();
                      }
                  });
               }}
               style={{ 
                   padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer'
               }}
           >
                <LogOut size={16} />
                <span>Leave</span>
           </button>

      {showQueueOption && pendingVideo && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
        }} onClick={() => { setShowQueueOption(false); }}>
           <div style={{
               background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', width: '90%', maxWidth: '400px',
               border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                position: 'relative'
           }} onClick={e => e.stopPropagation()}>
               <button 
                   onClick={() => { setShowQueueOption(false); }}
                   style={{
                       position: 'absolute', top: '10px', right: '10px',
                       background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer'
                   }}
               >
                   <X size={20} />
               </button>
               <h3 style={{ margin: 0, fontSize: '1.2rem', textAlign: 'center' }}>Play or Queue?</h3>
               <div style={{ 
                   width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: '8px', 
                   backgroundImage: `url(${pendingVideo.thumbnail?.replace('default.jpg', 'mqdefault.jpg') || ''})`,
                   backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative'
               }}>
                   <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.7)', color: 'white', padding: '0.5rem', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                       {pendingVideo.title}
                   </div>
               </div>
               
               <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                   <button 
                       className="btn-secondary" 
                       onClick={() => {
                           addToQueue(pendingVideo);
                           setShowQueueOption(false);
                           setPendingVideo(null);
                       }}
                       style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-tertiary)' }}
                   >
                       <ListPlus size={24} />
                       Add to Queue
                   </button>
                   <button 
                       className="btn-primary" 
                       onClick={() => {
                           // Optimistic Update: Play immediately for Admin
                           setCurrentVideoId(pendingVideo.id);
                           setIsPlaying(true);
                           
                           socket?.emit('sync_action', { roomId, type: 'change_video', payload: pendingVideo.id });
                           setShowQueueOption(false);
                           setPendingVideo(null);
                       }}
                       style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
                   >
                       <PlayCircle size={24} />
                       Play Now
                   </button>
               </div>
           </div>
        </div>
      )}

      {showShareDialog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', width: '90%', maxWidth: '350px',
            border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center'
          }}>
             <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Share Room</h2>
             
             {/* QR Code Section */}
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '100%' }}>
                 <div id="qr-code-container" style={{ background: 'white', padding: '1rem', borderRadius: '12px' }}>
                     <QRCode value={window.location.href} size={150} />
                 </div>
                 <button 
                    className="btn-secondary"
                    onClick={async () => {
                        try {
                            const svg = document.querySelector('#qr-code-container svg');
                            if (!svg) {
                                console.error('SVG not found');
                                return;
                            }
                            
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            let svgData = new XMLSerializer().serializeToString(svg);
                            
                            // Ensure namespace exists for data URI
                            if (!svgData.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
                                svgData = svgData.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
                            }
                            
                            const img = new Image();
                            
                            // Add white background for the copied image
                            canvas.width = 170; // 150 + padding
                            canvas.height = 170;
                            
                            img.onload = () => {
                                ctx.fillStyle = 'white'; // White background
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(img, 10, 10);
                                canvas.toBlob(blob => {
                                    if (!blob) {
                                        alert('Failed to create image blob');
                                        return;
                                    }
                                    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                                        .then(() => {
                                            setQrCopied(true);
                                            setTimeout(() => setQrCopied(false), 2000);
                                        })
                                        .catch(err => {
                                            console.error('Clipboard write failed', err);
                                            alert('Copy failed. Your browser might block image copying.');
                                        });
                                }, 'image/png');
                            };
                            
                            // Handle image load error
                            img.onerror = (e) => {
                                console.error('Image load error', e);
                                alert('Error processing QR image.');
                            };
                            
                            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData))); // Safe encoding
                        } catch (e) {
                            console.error('QR Copy Error', e);
                            alert('Could not copy QR image. Please screenshot instead.');
                        }
                    }}
                    style={{ 
                        fontSize: '0.85rem', 
                        padding: '0.5rem 1rem', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        background: qrCopied ? '#10b981' : 'var(--bg-tertiary)',
                        color: qrCopied ? 'white' : 'var(--text-primary)',
                        transition: 'background 0.2s'
                    }}
                 >
                    {qrCopied ? <Check size={14} /> : <Copy size={14} />} 
                    {qrCopied ? 'Copied Image!' : 'Copy QR Image'}
                 </button>
             </div>

             <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                 <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Room Link</label>
                 <div style={{ 
                     display: 'flex', gap: '0.5rem', background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)'
                 }}>
                     <input readOnly value={window.location.href} style={{ 
                         background: 'transparent', border: 'none', color: 'var(--text-secondary)', 
                         flex: 1, fontSize: '0.9rem', outline: 'none', minWidth: 0 // Fix overlap
                     }} />
                     <button 
                       onClick={() => { 
                         navigator.clipboard.writeText(window.location.href); 
                         setLinkCopied(true);
                         setTimeout(() => setLinkCopied(false), 2000);
                       }} 
                       style={{ 
                         background: linkCopied ? '#10b981' : 'var(--accent-primary)', 
                         border: 'none', 
                         borderRadius: '6px', 
                         color: 'white', 
                         padding: '0.4rem 0.8rem', 
                         cursor: 'pointer', 
                         fontSize: '0.85rem',
                         display: 'flex',
                         alignItems: 'center',
                         gap: '0.5rem',
                         transition: 'background 0.2s',
                         whiteSpace: 'nowrap' // Prevent button text wrap
                       }}
                     >
                       {linkCopied ? <Check size={16} /> : <Copy size={16} />}
                       {linkCopied ? 'Copied' : 'Copy'}
                     </button>
                 </div>
             </div>
             <button className="btn-secondary" onClick={() => setShowShareDialog(false)} style={{ width: '100%', cursor: 'pointer' }}>
                Close
             </button>
          </div>
        </div>
      )}

       {notification && (
        <div style={{
            position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
            background: notification.type === 'error' ? '#ef4444' : '#10b981',
            color: 'white', padding: '1rem 2rem', borderRadius: '50px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 20000,
            display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500',
            animation: 'fadeIn 0.3s ease-out'
        }}>
            {notification.type === 'success' ? <Check size={20} /> : null}
            {notification.message}
        </div>
      )}

      {confirmationDialog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
        }} onClick={() => setConfirmationDialog(null)}>
           <div style={{
               background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', width: '90%', maxWidth: '400px',
               border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1.5rem',
               boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
           }} onClick={e => e.stopPropagation()}>
               <h3 style={{ margin: 0, fontSize: '1.3rem' }}>{confirmationDialog.title}</h3>
               <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: '1.5' }}>{confirmationDialog.message}</p>
               
               <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                   <button 
                       className="btn-secondary" 
                       onClick={() => setConfirmationDialog(null)}
                       style={{ flex: 1, padding: '0.75rem', cursor: 'pointer' }}
                   >
                       Cancel
                   </button>
                   <button 
                       className={confirmationDialog.type === 'danger' ? 'btn-danger' : 'btn-primary'}
                       onClick={confirmationDialog.onConfirm}
                       style={{ flex: 1, padding: '0.75rem', cursor: 'pointer' }}
                   >
                       {confirmationDialog.confirmText || 'Confirm'}
                   </button>
               </div>
           </div>
        </div>
      )}

      {/* Admin Queue Request Dialog */}
      {pendingRequest && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11000
        }}>
           <div style={{
               background: 'rgba(20, 20, 20, 0.95)', 
               backdropFilter: 'blur(16px)',
               padding: '2rem', 
               borderRadius: '24px', 
               width: '90%', 
               maxWidth: '420px',
               border: '1px solid rgba(255, 255, 255, 0.1)', 
               display: 'flex', 
               flexDirection: 'column', 
               gap: '1.5rem',
               boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)'
           }}>
               <div style={{ textAlign: 'center' }}>
                   <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.4rem', fontWeight: '700', letterSpacing: '-0.5px' }}>
                     Queue Request
                   </h3>
                   <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
                       <strong style={{ color: 'white' }}>{pendingRequest.addedBy}</strong> wants to add a video.
                   </p>
               </div>
               
               <div style={{ 
                   width: '100%', 
                   aspectRatio: '16/9', 
                   background: '#000', 
                   borderRadius: '12px', 
                   overflow: 'hidden',
                   position: 'relative',
                   boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
                   border: '1px solid rgba(255,255,255,0.1)'
               }}>
                   <img 
                       src={pendingRequest.thumbnail} 
                       alt="Thumbnail" 
                       style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} 
                   />
                   <div style={{ 
                       position: 'absolute', bottom: 0, left: 0, right: 0, 
                       background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', 
                       padding: '1.5rem 1rem 1rem', 
                   }}>
                       <div style={{
                           color: 'white', 
                           fontWeight: '600',
                           fontSize: '1rem', 
                           lineHeight: '1.3',
                           display: '-webkit-box',
                           WebkitLineClamp: 2,
                           WebkitBoxOrient: 'vertical',
                           overflow: 'hidden'
                       }}>
                           {pendingRequest.title}
                       </div>
                   </div>
               </div>

               <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                   <button 
                       className="btn-danger" 
                       onClick={() => {
                           socket.emit('resolve_queue_request', { roomId, video: pendingRequest, approved: false });
                           setPendingRequest(null);
                       }}
                       style={{ flex: 1, padding: '1rem', cursor: 'pointer', borderRadius: '12px', fontWeight: 'bold' }}
                   >
                       Deny
                   </button>
                   <button 
                       className="btn-primary" 
                       onClick={() => {
                           socket.emit('resolve_queue_request', { roomId, video: pendingRequest, approved: true });
                           setPendingRequest(null);
                       }}
                       style={{ flex: 1, padding: '1rem', cursor: 'pointer', borderRadius: '12px', fontWeight: 'bold', background: 'var(--accent-primary)' }}
                   >
                       Approve
                   </button>
               </div>
           </div>
        </div>
      )}

           {showAdminPasswordDialog && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', zIndex: 10000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => setShowAdminPasswordDialog(false)}>
                    <div className="modal-content" style={{
                        background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px',
                        width: '300px', border: '1px solid var(--border-color)'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Key size={18} /> Set Room PIN
                        </h3>
                        <form onSubmit={confirmSetPassword}>
                            <input 
                                type="text" placeholder="Set 6-digit PIN" maxLength={6} value={newRoomPassword}
                                onChange={e => setNewRoomPassword(e.target.value.replace(/\D/g, ''))}
                                style={{
                                    width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)',
                                    background: 'var(--bg-tertiary)', color: 'white', marginBottom: '0.5rem',
                                    textAlign: 'center', letterSpacing: '4px', fontSize: '1.2rem'
                                }}
                                autoFocus
                            />
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem', textAlign: 'center' }}>
                                Leave blank to remove password
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button type="button" className="btn-secondary" style={{ flex: 1, cursor: 'pointer' }} onClick={() => setShowAdminPasswordDialog(false)}>Cancel</button>
                                <button type="submit" className="btn-primary" style={{ flex: 1, cursor: 'pointer' }}>Save</button>
                            </div>
                        </form>
                    </div>
                </div>
           )}

           {/* Queue Dialog */}
           {showQueueDialog && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', zIndex: 10000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => setShowQueueDialog(false)}>
                    <div className="modal-content" style={{
                        background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px',
                        width: '90%', maxWidth: '600px', maxHeight: '80vh', border: '1px solid var(--border-color)',
                        display: 'flex', flexDirection: 'column', gap: '1rem'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <ListPlus size={24} /> Video Queue ({queue.length})
                            </h3>
                            <button onClick={() => setShowQueueDialog(false)} style={{
                                background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer'
                            }}>
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
                            {queue.length === 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
                                    <Film size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                    <p>Queue is empty</p>
                                    <small>Add videos via Search</small>
                                </div>
                            ) : (
                                queue.map((item, index) => (
                                    <div 
                                        key={`${item.id}-${index}`} 
                                        style={{ 
                                            display: 'flex', 
                                            gap: '10px', 
                                            marginBottom: '10px', 
                                            background: 'var(--bg-tertiary)', 
                                            padding: '10px', 
                                            borderRadius: '8px', 
                                            alignItems: 'center'
                                        }}
                                    >
                                        <div style={{ 
                                            width: '80px', 
                                            height: '45px', 
                                            borderRadius: '4px', 
                                            backgroundSize: 'cover', 
                                            backgroundPosition: 'center', 
                                            backgroundImage: `url(${item.thumbnail || `https://img.youtube.com/vi/${item.id}/default.jpg`})`, 
                                            flexShrink: 0 
                                        }}></div>
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{ fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' }}>
                                                {item.title || 'Unknown Video'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Added by {item.addedBy}</div>
                                        </div>
                                        {isAdmin && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <button 
                                                    onClick={() => moveQueueItem(index, 'up')} 
                                                    disabled={index === 0}
                                                    style={{ 
                                                        background: 'transparent', 
                                                        border: 'none', 
                                                        color: index === 0 ? 'var(--text-tertiary)' : 'var(--accent-primary)', 
                                                        cursor: index === 0 ? 'not-allowed' : 'pointer', 
                                                        padding: '2px',
                                                        opacity: index === 0 ? 0.3 : 1
                                                    }}
                                                    title="Move up"
                                                >
                                                    <ChevronUp size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => moveQueueItem(index, 'down')} 
                                                    disabled={index === queue.length - 1}
                                                    style={{ 
                                                        background: 'transparent', 
                                                        border: 'none', 
                                                        color: index === queue.length - 1 ? 'var(--text-tertiary)' : 'var(--accent-primary)', 
                                                        cursor: index === queue.length - 1 ? 'not-allowed' : 'pointer', 
                                                        padding: '2px',
                                                        opacity: index === queue.length - 1 ? 0.3 : 1
                                                    }}
                                                    title="Move down"
                                                >
                                                    <ChevronDown size={16} />
                                                </button>
                                            </div>
                                        )}
                                        {isAdmin && (
                                            <button onClick={() => removeFromQueue(index)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }} title="Remove from queue">
                                                <X size={18} />
                                            </button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
           )}

           {/* Paste URL Dialog */}
           {showUrlInput && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', zIndex: 10000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => setShowUrlInput(false)}>
                    <div className="modal-content" style={{
                        background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px',
                        width: '90%', maxWidth: '500px', border: '1px solid var(--border-color)'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <LinkIcon size={24} /> Paste YouTube URL
                            </h3>
                            <button onClick={() => setShowUrlInput(false)} style={{
                                background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer'
                            }}>
                                <X size={24} />
                            </button>
                        </div>
                        
                        <form onSubmit={(e) => { changeVideo(e); }}>
                            <input 
                                type="text" 
                                placeholder="https://youtube.com/watch?v=..."
                                value={videoInput}
                                onChange={e => { 
                                  setVideoInput(e.target.value); 
                                  setUrlInputError(''); // Clear error on input
                                }}
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '0.8rem',
                                    borderRadius: '8px',
                                    border: urlInputError ? '2px solid #ef4444' : '1px solid var(--border-color)',
                                    background: 'var(--bg-tertiary)',
                                    color: 'white',
                                    marginBottom: urlInputError ? '0.5rem' : '1rem'
                                }}
                            />
                            {urlInputError && (
                              <div style={{ 
                                color: '#ef4444', 
                                fontSize: '0.85rem', 
                                marginBottom: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}>
                                <AlertTriangle size={16} /> <span>{urlInputError}</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button type="button" className="btn-secondary" onClick={() => { setShowUrlInput(false); setUrlInputError(''); }}>Cancel</button>
                                <button type="submit" className="btn-primary">Load Video</button>
                            </div>
                        </form>
                    </div>
                </div>
           )}
         </div>
      </header>

      <main className="room-content">
        <section className="video-section">
           <div className="controls-bar" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', justifyContent: 'flex-start' }}>
               {/* Mobile Chat Toggle */}
               <button 
                  className="btn-secondary mobile-chat-toggle" 
                  onClick={() => setShowMobileChat(!showMobileChat)}
                  style={{ display: 'none', alignItems: 'center', gap: '0.5rem', position: 'relative' }}
                  aria-label={showMobileChat ? 'Hide chat' : 'Show chat'}
               >
                  <MessageSquare size={18} /> {showMobileChat ? 'Hide Chat' : 'Chat'}
                   {unreadCount > 0 && !showMobileChat && (
                       <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                   )}
               </button>

               {/* Search Videos Button (Visible to All) */}
               <button 
                  className="btn-primary video-controls-search-btn" 
                  onClick={() => setShowSearch(true)}
                  style={{
                    padding: '0.6rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                  aria-label="Search for YouTube videos"
               >
                 <SearchIcon size={20} /> <span className="desktop-only-text">Search Videos</span>
               </button>
               {isAdmin ? (
                 <div className="video-controls-wrapper">
                    
                    {/* Paste URL Button */}
                    <button 
                        className="btn-secondary video-controls-paste-btn" 
                        onClick={() => setShowUrlInput(true)} 
                        title="Paste a direct YouTube link"
                        aria-label="Paste YouTube URL"
                        style={{
                          padding: '0.6rem 1rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                    >
                       <LinkIcon size={20} /> <span>Paste URL</span>
                    </button>
                    
                    {/* Auto-Play Toggle */}
                    {/* Auto-Play Toggle */}
                    <button 
                         className="btn-secondary" 
                         onClick={() => socket?.emit('toggle_autoplay', { roomId })}
                         title={autoPlayEnabled ? "Turn Off Auto-Play" : "Turn On Auto-Play"}
                         aria-label="Toggle auto-play recommendation mode"
                         style={{
                           padding: '0.6rem 1rem',
                           display: 'flex',
                           alignItems: 'center',
                           justifyContent: 'center',
                           gap: '0.5rem',
                           color: autoPlayEnabled ? 'var(--accent-primary)' : undefined,
                           borderColor: autoPlayEnabled ? 'var(--accent-primary)' : undefined,
                           background: autoPlayEnabled ? 'rgba(99, 102, 241, 0.1)' : undefined
                         }}
                    >
                       <Sparkles size={20} /> <span>{autoPlayEnabled ? 'Auto-Play On' : 'Auto-Play'}</span>
                    </button>
                    
                    <div className="video-controls-separator"></div>
                    
                    {/* Queue Button */}
                    <button 
                       className="btn-secondary" 
                       onClick={() => setShowQueueDialog(true)}
                       title="View queue"
                       aria-label={`View video queue, ${queue.length} video${queue.length !== 1 ? 's' : ''} queued`}
                       style={{ 
                         padding: '0.6rem 1rem', 
                         display: 'flex', 
                         alignItems: 'center', 
                         justifyContent: 'center',
                         gap: '0.5rem',
                         position: 'relative'
                       }}
                    >
                      <ListPlus size={20} /> <span>Queue</span>
                      {queue.length > 0 && (
                        <span style={{
                          position: 'absolute',
                          top: '-4px',
                          right: '-4px',
                          background: '#ef4444',
                          color: 'white',
                          borderRadius: '10px',
                          padding: '2px 6px',
                          fontSize: '0.7rem',
                          fontWeight: 'bold'
                        }}>{queue.length}</span>
                      )}
                    </button>
                    
                    {/* Skip Button */}
                    <button 
                       className="btn-secondary" 
                       onClick={handleSkip}
                       disabled={(queue.length === 0 && !autoPlayEnabled) || isSkipping}
                       title={isSkipping ? 'Skipping...' : (queue.length > 0 ? 'Skip to next video' : (autoPlayEnabled ? 'Skip to recommendation' : 'Queue is empty'))}
                       aria-label={isSkipping ? 'Skipping video' : 'Skip video'}
                       style={{ 
                         padding: '0.6rem 1rem', 
                         display: 'flex', 
                         alignItems: 'center', 
                         justifyContent: 'center',
                         gap: '0.5rem',
                         opacity: ((queue.length === 0 && !autoPlayEnabled) || isSkipping) ? 0.5 : 1,
                         cursor: ((queue.length === 0 && !autoPlayEnabled) || isSkipping) ? 'not-allowed' : 'pointer',
                         minWidth: '90px'
                       }}
                    >
                      {isSkipping ? <Loader2 size={20} className="animate-spin" /> : <SkipForward size={20} />} <span>{isSkipping ? 'Wait' : 'Skip'}</span>
                    </button>
                 </div>
                ) : (
                  <div className="video-controls" style={{ flex: 1, maxWidth: '350px' }}>
                     <div className="input-group" style={{ opacity: 0.7 }}>
                        <Film size={20} className="input-icon" />
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {isAdmin ? 'Only admin can load videos.' : 'Syncs automatically when playing. Only admin can add videos.'}
                        </span>
                     </div>
                  </div>
               )}
               
               {/* Queue Button - Visible to All Users */}
               {!isAdmin && (
                 <button 
                    className="btn-secondary" 
                    onClick={() => setShowQueueDialog(true)}
                    title="View queue"
                    style={{ 
                      padding: '0.6rem 1rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      gap: '0.5rem',
                      position: 'relative',
                      flex: 1
                    }}
                 >
                   <ListPlus size={20} /> <span>Queue</span>
                   {queue.length > 0 && (
                     <span style={{
                       position: 'absolute',
                       top: '-4px',
                       right: '-4px',
                       background: '#ef4444',
                       color: 'white',
                       borderRadius: '10px',
                       padding: '2px 6px',
                       fontSize: '0.7rem',
                       fontWeight: 'bold'
                     }}>{queue.length}</span>
                   )}
                 </button>
               )}
               
               
               {/* Mobile Only: Share and Leave Buttons */}
               <button 
                   className="btn-secondary mobile-only-btn"
                   onClick={() => setShowShareDialog(true)}
                   title="Share Room"
               >
                   <Share2 size={18} /> Share Room
               </button>

               <button 
                   className="btn-danger mobile-only-btn" 
                   onClick={() => {
                     setConfirmationDialog({
                      title: 'Leave Room',
                      message: 'Are you sure you want to leave the room?',
                      confirmText: 'Leave',
                      type: 'danger',
                      onConfirm: () => {
                          localStorage.removeItem(`localtube_session_${roomId}`);
                          onLeave();
                      }
                  })
                   }}
               >
                    <LogOut size={18} /> Leave Room
               </button>
           </div>
           
           {showSearch && (
             <VideoSearch 
               onSelect={handleVideoSelect} 
               onClose={() => setShowSearch(false)}
               initialQuery={searchQuery}
               initialResults={searchResults}
               onQueryChange={setSearchQuery}
               onResultsChange={setSearchResults}
               currentVideoId={currentVideoId}
             />
           )}

           <div className="video-player-wrapper" style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column' }}>
             <VideoPlayer 
                videoId={currentVideoId}
                playing={isPlaying}
                onPlay={onPlay}
                onPause={onPause}
                isAdmin={isAdmin}
                socket={socket}
                roomId={roomId}
                onEnded={() => {
                      // Attempt to play next. Server validates if this user is allowed (Admin or correct video ended)
                      if (socket) socket.emit('play_next', { roomId, endedVideoId: currentVideoId });
                }}
                onSeek={(newTime, isPlaying) => {
                      if (isAdmin && socket) {
                          console.log(`[Room] Admin seeked to ${newTime}s (Playing: ${isPlaying})`);
                          socket.emit('sync_action', { 
                             roomId, 
                             type: 'seek', 
                             payload: { time: newTime, playing: isPlaying }
                          });
                      }
                }}
                fitContainer={true}
             />
           </div>
        </section>

        <aside className={`chat-section ${showMobileChat ? 'mobile-visible' : ''}`}>
           {/* Chat Header */}
           <div className="chat-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0.5rem', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <MessageSquare size={18} /> Chat
                  {unreadCount > 0 && <span className="tab-badge" style={{ background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: '10px', fontSize: '0.7em' }}>{unreadCount}</span>}
              </h3>
              <button className="mobile-close-btn" onClick={() => setShowMobileChat(false)} style={{ display: showMobileChat ? 'block' : 'none', background: 'transparent', border: 'none', color: 'var(--text-tertiary)' }}>
                  <X size={18} />
              </button>
           </div>
           
           <div className="messages-list">
              {messages.map(msg => (
                  <div key={msg.id} className={`message ${msg.type}`}>
                     {msg.type === 'user' ? (
                        <>
                           <span className="username" style={{ color: msg.userId === socket.id ? '#6366f1' : '#a1a1aa' }}>
                             {msg.name || 'Unknown'}
                           </span>
                           <span className="timestamp" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: '0.5rem', marginRight: '0.5rem', opacity: 0.6 }}>
                               {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                           </span>
                           {msg.image && (
                               <div style={{ marginTop: '0.5rem', marginBottom: '0.25rem' }}>
                                   <img 
                                      src={msg.image} 
                                      alt="User shared" 
                                      style={{ 
                                          maxWidth: '100%', 
                                          maxHeight: '300px', 
                                          borderRadius: '8px', 
                                          cursor: 'pointer',
                                          border: '1px solid var(--border-color)'
                                      }} 
                                      onClick={() => setViewingImage(msg.image)}
                                   />
                               </div>
                           )}
                           {msg.message && (
                               <span className="text" style={{ wordBreak: 'break-word', display: 'block', marginTop: msg.image ? '0.25rem' : '0' }}>
                                   {(() => {
                                       const urlRegex = /(https?:\/\/[^\s]+)/g;
                                       const parts = msg.message.split(urlRegex);
                                       return parts.map((part, i) => {
                                           if (part.match(urlRegex)) {
                                               return <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>{part}</a>;
                                           }
                                           return part;
                                       });
                                   })()}
                               </span>
                           )}
                        </>
                     ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}>
                            <span className="system-text">{msg.content}</span>
                            {msg.timestamp && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.5 }}>
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                        </div>
                     )}
                  </div>
              ))}
              <div ref={messagesEndRef} />
           </div>

                 <div className="chat-input-wrapper" style={{ position: 'relative' }}>
                     {showEmojiPicker && (
                         <div style={{ position: 'absolute', bottom: '110%', left: '0', zIndex: 50, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', borderRadius: '8px' }}>
                             <EmojiPicker 
                                onEmojiClick={onEmojiClick} 
                                theme="dark" 
                                width={300} 
                                height={350}
                                emojiStyle="native"
                             />
                         </div>
                     )}
                     <form onSubmit={sendMessage} className="chat-input fa" style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg-secondary)', padding: '0.8rem', borderRadius: '0' }}>
                        <button 
                            type="button" 
                            className="btn-icon" 
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            style={{ color: showEmojiPicker ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                            title="Add Emoji"
                            aria-label="Toggle emoji picker"
                        >
                            <Smile size={20} />
                        </button>
                        <button 
                            type="button" 
                            className="btn-icon" 
                            onClick={() => fileInputRef.current?.click()}
                            title="Upload Image"
                            style={{ color: 'var(--text-secondary)' }}
                            aria-label="Upload image"
                        >
                            <ImageIcon size={20} />
                        </button>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleImageUpload} 
                            accept="image/*" 
                            style={{ display: 'none' }} 
                        />
                        
                        <input 
                            type="text" 
                            placeholder="Type a message..." 
                            value={msgInput} 
                            onChange={e => setMsgInput(e.target.value)} 
                            onFocus={() => setShowEmojiPicker(false)}
                            style={{ flex: 1 }}
                        />
                        <button type="submit" className="btn-icon" aria-label="Send message"><Send size={18} /></button>
                     </form>
                 </div>
        </aside>
      </main>

      {/* Image Viewer Modal */}
      {viewingImage && (
            <div 
                style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.92)',
                    zIndex: 2500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(10px)',
                    animation: 'modalFadeIn 0.3s ease-out'
                }} 
                onClick={() => setViewingImage(null)}
            >
               {/* Animation Keyframes */}
               <style>{`
                 @keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
                 @keyframes imageZoom { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
               `}</style>

               <button 
                    onClick={() => setViewingImage(null)}
                    aria-label="Close image viewer"
                    className="btn-icon"
                    style={{
                      position: 'absolute',
                      top: '20px',
                      right: '25px',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.2)',
                      transition: 'all 0.2s',
                      zIndex: 2501
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.transform = 'rotate(90deg)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'rotate(0deg)'; }}
               >
                    <X size={24} />
               </button>

               <div style={{ position: 'relative', width: 'auto', height: 'auto', display: 'flex', justifyContent: 'center' }}>
                  <img 
                    src={viewingImage} 
                    alt="Full size" 
                    style={{ 
                      maxWidth: '96vw', 
                      maxHeight: '92vh', 
                      borderRadius: '12px', 
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                      objectFit: 'contain',
                      animation: 'imageZoom 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                    }} 
                    onClick={(e) => e.stopPropagation()} 
                  />
               </div>
            </div>
      )}
      
    </div>
  );
}
