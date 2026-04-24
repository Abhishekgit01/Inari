import { useEffect, useRef } from 'react';

const FRAME_COUNT = 192;
const currentFrame = (index: number) =>
  `/Sequence/frame_${index.toString().padStart(3, '0')}_delay-0.042s.png`;

interface SequenceBackgroundProps {
  fixedFrame?: number;
}

export function SequenceBackground({ fixedFrame }: SequenceBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const images: HTMLImageElement[] = [];
    let loadedImages = 0;

    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.src = currentFrame(i);
      img.onload = () => {
        loadedImages++;
        if (loadedImages === 1) {
          updateImage(fixedFrame ?? 0);
        }
      };
      images.push(img);
    }

    const handleScroll = () => {
      if (fixedFrame !== undefined) return;
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
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

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

    if (fixedFrame === undefined) {
      window.addEventListener('scroll', handleScroll, { passive: true });
    }
    
    const handleResize = () => {
      const html = document.documentElement;
      const scrollFraction = html.scrollHeight > window.innerHeight ? (html.scrollTop / (html.scrollHeight - window.innerHeight)) : 0;
      const frameIndex = fixedFrame ?? Math.min(FRAME_COUNT - 1, Math.floor(scrollFraction * FRAME_COUNT));
      updateImage(frameIndex);
    };

    window.addEventListener('resize', handleResize);
    
    updateImage(fixedFrame ?? 0);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [fixedFrame]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ 
        position: 'fixed', 
        top: 0, left: 0, 
        width: '100vw', height: '100vh', 
        zIndex: 0, 
        objectFit: 'cover',
        pointerEvents: 'none'
      }} 
    />
  );
}
