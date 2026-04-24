import { useEffect, useRef } from 'react';
import FrontWebsite from '../../Front/src/App';

interface WebsitePageProps {
  onDemo: () => void;
  onLogin: () => void;
}

const FRAME_COUNT = 192;
const currentFrame = (index: number) =>
  `/Sequence/frame_${index.toString().padStart(3, '0')}_delay-0.042s.png`;

export function WebsitePage({ onDemo, onLogin }: WebsitePageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load and cache all images for smooth scroll
  useEffect(() => {
    const images: HTMLImageElement[] = [];
    let loadedImages = 0;

    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.src = currentFrame(i);
      img.onload = () => {
        loadedImages++;
        if (loadedImages === 1) {
          // Draw the first frame as soon as it loads to avoid initial blank
          updateImage(0);
        }
      };
      images.push(img);
    }

    const handleScroll = () => {
      const html = document.documentElement;
      const scrollTop = html.scrollTop;
      const maxScrollTop = html.scrollHeight - window.innerHeight;
      
      const scrollFraction = maxScrollTop > 0 ? (scrollTop / maxScrollTop) : 0;
      const frameIndex = Math.min(
        FRAME_COUNT - 1,
        Math.floor(scrollFraction * FRAME_COUNT)
      );

      requestAnimationFrame(() => updateImage(frameIndex));
    };

    const updateImage = (index: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      const img = images[index];
      if (img && img.complete && img.naturalWidth !== 0) {
        // Adjust canvas resolution dynamically
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Perform object-fit: cover equivalent drawing
        const hRatio = canvas.width / img.naturalWidth;
        const vRatio = canvas.height / img.naturalHeight;
        const ratio = Math.max(hRatio, vRatio);
        
        const centerShift_x = (canvas.width - img.naturalWidth * ratio) / 2;
        const centerShift_y = (canvas.height - img.naturalHeight * ratio) / 2;
        
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
          img,
          0, 0, img.naturalWidth, img.naturalHeight,
          centerShift_x, centerShift_y, img.naturalWidth * ratio, img.naturalHeight * ratio
        );
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', () => updateImage(0));
    
    // Attempt drawing initial frame immediately if it was cached
    updateImage(0);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', () => updateImage(0));
    };
  }, []);

  // Handle CTA routing clicks
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const actionable = target.closest('button, a');
      if (!(actionable instanceof HTMLElement)) return;

      const label = actionable.textContent?.trim().toLowerCase() || '';
      if (label.includes('login')) {
        event.preventDefault();
        onLogin();
        return;
      }
      if (label.includes('demo') || label.includes('pilot') || label.includes('specialist')) {
        event.preventDefault();
        onDemo();
      }
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [onDemo, onLogin]);

  return (
    <div ref={containerRef} className="website-page-wrapper">
      <style>
        {`
          /* Injecting transparency into body and main elements so the canvas is visible */
          html, body, #root, main {
            background-color: transparent !important;
            background: transparent !important;
          }
          .dark body {
            background-color: transparent !important;
          }
          /* Removing background from sections that might hide the canvas, depending on original CSS */
          .bg-white, .bg-surface, .dark .bg-surface {
            background-color: transparent !important;
          }
          
          /* Ensures body allows scrolling over the fixed background */
          body {
            overflow-x: hidden;
            overflow-y: auto;
          }
        `}
      </style>
      
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: -1,
          pointerEvents: 'none',
        }}
      />
      
      <div style={{ position: 'relative', zIndex: 1, pointerEvents: 'auto' }}>
        <FrontWebsite />
      </div>
    </div>
  );
}
