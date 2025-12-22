import { useEffect, useRef } from 'react';

/**
 * useKeepAlive
 * Creates a silent Web Audio API oscillator to preventing the browser
 * from throttling the tab when in the background.
 * 
 * HARDENING: We initialized the AudioContext ONCE and keep it alive.
 * We only disconnect the oscillator if needed, but we try to keep the
 * context running to ensure we don't lose the navigation rights.
 */
export const useKeepAlive = (enable = false) => {
    const audioContextRef = useRef(null);
    const oscillatorRef = useRef(null);
    const gainRef = useRef(null);
    
    // 1. Initialize Context ONCE on mount
    useEffect(() => {
        const initAudio = () => {
            if (audioContextRef.current) return;
            
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                
                const ctx = new AudioContext();
                audioContextRef.current = ctx;
                
                // Create silent gain node
                const gain = ctx.createGain();
                gain.gain.value = 0.001; // Silent but "active"
                gain.connect(ctx.destination);
                gainRef.current = gain;
                
                console.log('[KeepAlive] Audio Context Initialized');
            } catch (err) {
                console.error('[KeepAlive] Failed to init:', err);
            }
        };

        const handleInteraction = () => {
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume().then(() => {
                    console.log('[KeepAlive] AudioContext resumed by user interaction.');
                });
            } else if (!audioContextRef.current) {
                initAudio();
            }
        };

        window.addEventListener('click', handleInteraction);
        window.addEventListener('touchstart', handleInteraction);
        window.addEventListener('keydown', handleInteraction);
        
        // Try initial start
        initAudio();
        
        return () => {
             window.removeEventListener('click', handleInteraction);
             window.removeEventListener('touchstart', handleInteraction);
             window.removeEventListener('keydown', handleInteraction);
             
             if (audioContextRef.current) {
                 audioContextRef.current.close().catch(() => {});
                 audioContextRef.current = null;
             }
        };
    }, []);

    // 2. Control Oscillator based on 'enable'
    useEffect(() => {
        if (!audioContextRef.current) return;
        const ctx = audioContextRef.current;
        
        if (enable) {
            // Ensure oscillator is running
            if (!oscillatorRef.current) {
                try {
                    const osc = ctx.createOscillator();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(440, ctx.currentTime);
                    
                    // Connect to our silent gain node
                    if (gainRef.current) {
                        osc.connect(gainRef.current);
                    }
                    
                    osc.start();
                    oscillatorRef.current = osc;
                    console.log('[KeepAlive] Oscillator STARTED');
                } catch (e) {
                    console.error('[KeepAlive] Error starting osc:', e);
                }
            }
            
            // Ensure context is running
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
        } else {
            // We do NOT stop the oscillator immediately to handle quick toggles.
            // But for now, let's keep it simple: only stop if we really mean it.
            // Actually, for "Room" logic, we might just want it ALWAYS ON if connected?
            // Let's stick to the prop control but maybe simpler.
            
            // If we disable, we can stop it.
            if (oscillatorRef.current) {
                 try {
                     oscillatorRef.current.stop();
                     oscillatorRef.current.disconnect();
                 } catch(e) {}
                 oscillatorRef.current = null;
                 console.log('[KeepAlive] Oscillator STOPPED');
            }
        }
    }, [enable]);
};
