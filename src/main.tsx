import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

/* ─── Patch requestAnimationFrame BEFORE anything loads ───
   Spline's onFrame handler throws "Cannot read properties of
   undefined (reading 'position')" — this guard suppresses it
   at the rAF level so it never reaches the console.          */
const _origRaf = window.requestAnimationFrame;
window.requestAnimationFrame = function (cb: FrameRequestCallback): number {
  return _origRaf.call(window, (time) => {
    try { cb(time); } catch { /* suppress Spline internal crash */ }
  });
};

/* Suppress unhandled error events from Spline's internal code */
window.addEventListener('error', (event) => {
  if (event.message?.includes('position') || event.message?.includes('spline') || event.message?.includes('Spline')) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

createRoot(document.getElementById('root')!).render(
  <App />
);
