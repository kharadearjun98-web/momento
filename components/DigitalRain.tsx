import React, { useEffect, useRef } from 'react';

export const DigitalRain: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, isActive: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    
    const handleMouseMove = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        mouseRef.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            isActive: true
        };
    };

    const handleMouseLeave = () => {
        mouseRef.current.isActive = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    // Dark Phoenix Palette: Cosmic Fire (Reds, Oranges, Golds, Deep Purples)
    const colors = [
      '#450a0a', // Deepest Red
      '#7f1d1d', // Dark Red
      '#b91c1c', // Red
      '#ef4444', // Bright Red
      '#f97316', // Orange
      '#fbbf24', // Gold/Amber
      '#581c87', // Cosmic Purple
      '#3b0764', // Deep Indigo
    ];

    class FireParticle {
      x: number;
      y: number;
      speed: number;
      size: number;
      color: string;
      length: number;
      wobble: number;
      wobbleSpeed: number;
      opacity: number;

      constructor() {
        this.reset(true);
      }

      reset(initial: boolean = false) {
        this.x = Math.random() * canvas.width;
        // If initial, scatter vertically. If not, spawn at top.
        this.y = initial ? Math.random() * canvas.height : -50 - Math.random() * 100;
        
        // Slower speed: Reduced to (1.0 to 3.0)
        this.speed = Math.random() * 2 + 1.0;
        
        // Bigger size: (2.0 to 6.0)
        this.size = Math.random() * 4 + 2.0;
        
        // Longer length to compensate for slower speed visually
        this.length = Math.random() * 40 + 20;
        
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.wobble = Math.random() * Math.PI * 2;
        this.wobbleSpeed = Math.random() * 0.1 - 0.05;
        this.opacity = Math.random() * 0.5 + 0.5;
      }

      update() {
        this.y += this.speed;
        
        // Natural fire wobble
        this.wobble += this.wobbleSpeed;
        this.x += Math.sin(this.wobble) * 0.5;

        // Interactive Turbulence
        if (mouseRef.current.isActive) {
            const dx = this.x - mouseRef.current.x;
            const dy = this.y - mouseRef.current.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const interactionRadius = 250;

            if (distance < interactionRadius) {
                const force = (interactionRadius - distance) / interactionRadius;
                const angle = Math.atan2(dy, dx);
                
                // Push particles away from mouse (parting the fire)
                this.x += Math.cos(angle) * force * 5;
                this.y += Math.sin(angle) * force * 5;
                
                // Brighten/Heat up near interaction
                this.opacity = Math.min(1, this.opacity + 0.1);
            }
        }

        // Respawn if off screen
        if (this.y > canvas.height + 100) {
          this.reset();
        }
      }

      draw() {
        ctx.beginPath();
        // Create gradient for the streak
        const gradient = ctx.createLinearGradient(this.x, this.y, this.x, this.y - this.length);
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = this.size;
        ctx.lineCap = 'round';
        
        ctx.moveTo(this.x, this.y);
        // Draw tail upwards (since it's falling down)
        ctx.lineTo(this.x + Math.sin(this.wobble) * 2, this.y - this.length);
        
        ctx.globalAlpha = this.opacity;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Occasional ember/spark at the head
        if (Math.random() > 0.98) {
            ctx.fillStyle = '#fff';
            // Scale ember with particle size
            ctx.fillRect(this.x - (this.size/2), this.y, this.size, this.size);
        }
      }
    }

    // Significantly reduced density for a cleaner, less overwhelming look
    const particleCount = Math.min(window.innerWidth / 10, 150);
    const particles: FireParticle[] = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push(new FireParticle());
    }

    const draw = () => {
      // Clear with trail effect for motion blur
      // Darker fade for higher contrast fire
      ctx.fillStyle = 'rgba(5, 6, 8, 0.2)'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Additive blending makes overlapping colors glow like fire
      ctx.globalCompositeOperation = 'lighter';

      particles.forEach(p => {
        p.update();
        p.draw();
      });
      
      ctx.globalCompositeOperation = 'source-over';

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', setCanvasSize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none bg-[#050608]">
        <canvas ref={canvasRef} className="block w-full h-full" />
        {/* Vignette to focus center */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#050608_90%)] z-10 pointer-events-none" />
    </div>
  );
};