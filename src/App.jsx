import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Play, Zap, Calendar, Compass, Users, Lock, Unlock, Radio, MonitorPlay } from 'lucide-react';
import { Room } from './components/Room';

function Landing() {
  const [username, setUsername] = useState(localStorage.getItem('localtube_username') || '');
  const [searchParams] = useSearchParams();
  const [joinInput, setJoinInput] = useState(searchParams.get('join') || '');
  const [errors, setErrors] = useState({ name: '', room: '', password: '' });
  const [password, setPassword] = useState(''); // New password state
  const navigate = useNavigate();
  
  // Effect to update join input if URL changes (e.g. redirect)
  useEffect(() => {
    const joinParam = searchParams.get('join');
    if (joinParam) {
        setJoinInput(joinParam);
    }
  }, [searchParams]);

  const [activeRooms, setActiveRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  useEffect(() => {
    const fetchRooms = async () => {
        try {
            const res = await fetch('/api/active-rooms'); 
            if (res.ok) {
                const data = await res.json();
                setActiveRooms(data);
            }
        } catch (e) {
            console.error('Failed to fetch rooms:', e);
        } finally {
            setLoadingRooms(false);
        }
    };
    
    fetchRooms();
    const interval = setInterval(fetchRooms, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, []);

  const handleCreate = () => {
    if (!username.trim()) {
        setErrors(p => ({ ...p, name: 'Please enter a display name first' }));
        return;
    }
    if (password && !/^\d{6}$/.test(password)) {
        setErrors(p => ({ ...p, password: 'PIN must be exactly 6 digits (0-9)' }));
        return;
    }
    setErrors({ name: '', room: '', password: '' });
    localStorage.setItem('localtube_username', username.trim());
    const roomId = uuidv4().slice(0, 8);
    // Pass password in state so Room.jsx can use it for initial join
    navigate(`/room/${roomId}`, { state: { password } });
  };

  const handleJoin = (e) => {
    e.preventDefault();
    let hasError = false;
    const newErrors = { name: '', room: '' };
    if (!username.trim()) {
        newErrors.name = 'Please enter a display name first';
        hasError = true;
    }
    if (!joinInput.trim()) {
        newErrors.room = 'Please enter a Room ID';
        hasError = true;
    }
    setErrors(newErrors);
    if (hasError) return;

    localStorage.setItem('localtube_username', username.trim());
    navigate(`/room/${joinInput.trim()}`, { state: { password } });
  };

  return (
    <div className="landing">
       <div className="landing-content">
          <div className="landing-header">
            <div className="landing-logo-box">
                <Play size={40} fill="white" color="white" />
            </div>
            <h1 className="landing-title">OceanTube</h1>
          </div>
          
          <p className="landing-description">
            Watch YouTube videos together with friends from anywhere. 
            Synchronized playback, real-time chat, and no lag.
          </p>

          <div className="landing-form-container">
             <div className="input-wrapper">
                 <label className="input-label">Display Name</label>
                 <input 
                    type="text" 
                    placeholder="Enter your name..." 
                    value={username}
                    onChange={e => { setUsername(e.target.value); setErrors(p => ({ ...p, name: '' })); }}
                    className={`styled-input ${errors.name ? 'error' : ''}`}
                 />
                 {errors.name && (
                    <div className="error-msg">
                        {errors.name}
                    </div>
                 )}
             </div>

             {!searchParams.get('join') && (
                 <div className="input-wrapper">
                     <label className="input-label">Room PIN (Optional)</label>
                     <input 
                        type="text" 
                        placeholder="Set 6-digit PIN" 
                        value={password}
                        maxLength={6}
                        onChange={e => { 
                            const val = e.target.value.replace(/\D/g, ''); // Only numbers
                            setPassword(val); 
                            setErrors(p => ({ ...p, password: '' })); 
                        }}
                        className={`styled-input ${errors.password ? 'error' : ''}`}
                        style={{ letterSpacing: '4px' }}
                     />
                     {errors.password && (
                        <div className="error-msg">
                            {errors.password}
                        </div>
                     )}
                     <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', opacity: 0.7 }}>
                        Leave blank for an open room
                     </div>
                 </div>
             )}

             {joinInput && searchParams.get('join') ? (
                 <div className="join-overlay-card">
                     <h2 style={{ fontSize: '1.5rem', textAlign: 'center', margin: 0 }}>Join Room</h2>
                     <p style={{ textAlign: 'center', color: 'var(--text-secondary)', margin: 0 }}>
                         You are joining room <span style={{ color: 'var(--accent-primary)', fontFamily: 'monospace' }}>{joinInput}</span>
                     </p>
                     
                     <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                        <input 
                        type="text" 
                        placeholder="Room ID" 
                        value={joinInput}
                        readOnly // Lock it if from link
                        className={`styled-input ${errors.room ? 'error' : ''}`}
                        style={{ cursor: 'not-allowed', fontSize: '1.2rem' }}
                        />
                        <button type="submit" className="btn-primary" aria-label="Join Room Now" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', borderRadius: '12px' }}>Join Now</button>
                    </form>
                    
                    <button 
                        className="btn-link" 
                        onClick={() => { setJoinInput(''); navigate('/', { replace: true }); }}
                        aria-label="Cancel and go back to home"
                        style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: 'var(--text-secondary)', 
                            cursor: 'pointer', 
                            textDecoration: 'underline',
                            fontSize: '0.9rem'
                        }}
                    >
                        Cancel and go back
                    </button>
                 </div>
             ) : (
                <div className="action-grid">
                    <button className="btn-primary create-room-btn" onClick={handleCreate} aria-label="Create a new room">
                        <div style={{ background: 'rgba(255,255,255,0.2)', padding: '1rem', borderRadius: '50%' }}>
                            <Play size={32} fill="currentColor" />
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>Create Room</span>
                    </button>
                    
                    <div className="join-card">
                        <label style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', fontWeight: 500, textAlign: 'center' }}>Join Existing</label>
                        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', width: '100%' }}>
                            <input 
                            type="text" 
                            placeholder="Room ID" 
                            value={joinInput}
                            onChange={e => { setJoinInput(e.target.value); setErrors(p => ({ ...p, room: '' })); }}
                            className={`styled-input ${errors.room ? 'error' : ''}`}
                            style={{ fontSize: '1rem' }}
                            />
                            <button type="submit" className="btn-secondary" aria-label="Join existing room" style={{ width: '100%', padding: '0.8rem', fontSize: '1rem', borderRadius: '12px' }}>Join Room</button>
                        </form>
                    </div>
                </div>
             )}
          </div>

          {/* Active Rooms Grid */}
          <div style={{ marginTop: '3rem', width: '100%', maxWidth: '1000px', paddingBottom: '2rem' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', justifyContent: 'center' }}>
                <Radio size={24} className="pulse" style={{ color: '#ef4444' }} />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Active Rooms</h3>
                {loadingRooms && <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>(Updating...)</span>}
             </div>

             <div style={{ 
                 display: 'grid', 
                 gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                 gap: '1rem',
                 width: '100%'
             }}>
                 {!loadingRooms && activeRooms.length === 0 && (
                     <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem', border: '1px dashed var(--border-color)', borderRadius: '12px', color: 'var(--text-secondary)' }}>
                         No active rooms right now. Be the first to create one!
                     </div>
                 )}
                 
                 {activeRooms.map(room => (
                     <button
                        key={room.id} 
                        onClick={() => {
                             setJoinInput(room.id);
                             window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="room-card-btn"
                        aria-label={`Join Room ${room.id}. Status: ${room.isPrivate ? 'Private' : 'Public'}. ${room.playing ? 'Now Playing: ' + (room.currentTitle || 'Unknown Video') : 'Waiting for video'}. Host: ${room.adminName}. Users: ${room.userCount}.`}
                        style={{
                            width: '100%',
                            textAlign: 'left',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '12px',
                            padding: '1rem',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.8rem',
                            transition: 'all 0.2s',
                            position: 'relative',
                            overflow: 'hidden',
                            fontFamily: 'inherit',
                            color: 'inherit'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.borderColor = 'var(--accent-primary)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.borderColor = 'var(--border-color)';
                        }}
                        onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                        onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                     >
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.9rem' }}>
                                #{room.id}
                            </span>
                            {room.isPrivate ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#fbbf24', background: 'rgba(251, 191, 36, 0.1)', padding: '2px 8px', borderRadius: '100px' }}>
                                    <Lock size={12} aria-hidden="true" /> Private
                                </span>
                            ) : (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#4ade80', background: 'rgba(74, 222, 128, 0.1)', padding: '2px 8px', borderRadius: '100px' }}>
                                    <Unlock size={12} aria-hidden="true" /> Public
                                </span>
                            )}
                        </div>

                        {/* Title Info */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                             {room.playing ? (
                                 <MonitorPlay size={16} aria-hidden="true" style={{ color: 'var(--accent-primary)', marginTop: '3px', flexShrink: 0 }} />
                             ) : (
                                 <MonitorPlay size={16} aria-hidden="true" style={{ color: 'var(--text-tertiary)', marginTop: '3px', flexShrink: 0 }} />
                             )}
                             <span style={{ 
                                 fontSize: '0.95rem', 
                                 fontWeight: 500, 
                                 lineHeight: '1.4',
                                 display: '-webkit-box',
                                 WebkitLineClamp: 2,
                                 WebkitBoxOrient: 'vertical',
                                 overflow: 'hidden',
                                 color: room.playing ? 'var(--text-primary)' : 'var(--text-secondary)'
                             }}>
                                 {room.currentTitle || 'Waiting for video...'}
                             </span>
                        </div>

                        {/* Footer */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.8rem', borderTop: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                <Users size={14} aria-hidden="true" /> {room.userCount}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
                                Host: <span style={{ color: 'var(--text-secondary)' }}>{room.adminName}</span>
                            </div>
                        </div>
                     </button>
                 ))}
             </div>
          </div>
       </div>
       
       {/* Footer Section */}
       <footer style={{
         marginTop: 'auto',
         padding: '2rem 1rem',
         borderTop: '1px solid var(--border-color)',
         background: 'var(--bg-secondary)',
         width: '100%'
       }}>
         <div style={{
           maxWidth: '1200px',
           margin: '0 auto',
           display: 'flex',
           flexDirection: 'column',
           gap: '1.5rem',
           alignItems: 'center',
           textAlign: 'center'
         }}>
           {/* Product Credit */}
           <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
             A product by <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>Ocean LITMERS</span>
           </div>
           
           {/* Powered By & GitHub */}
           <div style={{
             display: 'flex',
             gap: '2rem',
             flexWrap: 'wrap',
             justifyContent: 'center',
             alignItems: 'center'
           }}>
             <a 
               href="https://antigravity.google/" 
               target="_blank" 
               rel="noopener noreferrer"
               style={{
                 color: 'var(--text-secondary)',
                 textDecoration: 'none',
                 fontSize: '0.85rem',
                 display: 'flex',
                 alignItems: 'center',
                 gap: '0.5rem',
                 transition: 'color 0.2s'
               }}
               onMouseEnter={e => e.target.style.color = 'var(--accent-primary)'}
               onMouseLeave={e => e.target.style.color = 'var(--text-secondary)'}
             >
               <Zap size={16} /> Powered by <span style={{ fontWeight: 600 }}>Antigravity</span>
             </a>
             
             <a 
               href="https://github.com/cigrocean/OceanTube" 
               target="_blank" 
               rel="noopener noreferrer"
               style={{
                 color: 'var(--text-secondary)',
                 textDecoration: 'none',
                 fontSize: '0.85rem',
                 display: 'flex',
                 alignItems: 'center',
                 gap: '0.5rem',
                 transition: 'color 0.2s'
               }}
               onMouseEnter={e => e.target.style.color = 'var(--accent-primary)'}
               onMouseLeave={e => e.target.style.color = 'var(--text-secondary)'}
             >
               <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                 <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
               </svg>
               GitHub
             </a>
           </div>
           
           {/* Other Projects */}
           <div style={{
             display: 'flex',
             flexDirection: 'column',
             gap: '0.75rem',
             width: '100%',
             maxWidth: '600px'
           }}>
             <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
               Check my other projects:
             </div>
             <div style={{
               display: 'flex',
               gap: '1rem',
               flexWrap: 'wrap',
               justifyContent: 'center'
             }}>
               <a 
                 href="https://cigromeetingroomsbooking.vercel.app/" 
                 target="_blank" 
                 rel="noopener noreferrer"
                 style={{
                   padding: '0.5rem 1rem',
                   background: 'var(--bg-tertiary)',
                   borderRadius: '8px',
                   color: 'var(--text-primary)',
                   textDecoration: 'none',
                   fontSize: '0.85rem',
                   transition: 'all 0.2s',
                   border: '1px solid var(--border-color)',
                   display: 'flex',
                   alignItems: 'center',
                   gap: '0.5rem'
                 }}
                 onMouseEnter={e => {
                   e.target.style.background = 'var(--accent-primary)';
                   e.target.style.borderColor = 'var(--accent-primary)';
                 }}
                 onMouseLeave={e => {
                   e.target.style.background = 'var(--bg-tertiary)';
                   e.target.style.borderColor = 'var(--border-color)';
                 }}
               >
                 <Calendar size={16} style={{ flexShrink: 0 }} /> Cigro Meeting Rooms Booking
               </a>
               
               <a 
                 href="https://github.com/cigrocean/SwaggerNav" 
                 target="_blank" 
                 rel="noopener noreferrer"
                 style={{
                   padding: '0.5rem 1rem',
                   background: 'var(--bg-tertiary)',
                   borderRadius: '8px',
                   color: 'var(--text-primary)',
                   textDecoration: 'none',
                   fontSize: '0.85rem',
                   transition: 'all 0.2s',
                   border: '1px solid var(--border-color)',
                   display: 'flex',
                   alignItems: 'center',
                   gap: '0.5rem'
                 }}
                 onMouseEnter={e => {
                   e.target.style.background = 'var(--accent-primary)';
                   e.target.style.borderColor = 'var(--accent-primary)';
                 }}
                 onMouseLeave={e => {
                   e.target.style.background = 'var(--bg-tertiary)';
                   e.target.style.borderColor = 'var(--border-color)';
                 }}
               >
                 <Compass size={16} style={{ flexShrink: 0 }} /> SwaggerNav
               </a>
             </div>
           </div>
         </div>
       </footer>
    </div>
  );
}

import { useLocation } from 'react-router-dom'; // Add import

function RoomWrapper() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation(); // Hook for state
  const username = localStorage.getItem('localtube_username');
  const initialPassword = location.state?.password || null;

  // Redirect if no username, but keep the room ID as a query param
  if (!username) {
     return <Navigate to={`/?join=${roomId}`} replace />;
  }

  return <Room roomId={roomId} username={username} initialPassword={initialPassword} onLeave={() => navigate('/')} />;
}

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/room/:roomId" element={<RoomWrapper />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
