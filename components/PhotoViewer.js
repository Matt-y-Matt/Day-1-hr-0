'use client';
import { useEffect, useRef, useState } from 'react';
export default function PhotoViewer({ src, alt, className = '', onError }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  useEffect(() => { if (open) dialog.current?.showModal?.(); }, [open]);
  return <>
    <button type="button" className="photo-zoom" onClick={() => setOpen(true)} aria-label={`Enlarge ${alt}`}><img src={src} alt={alt} className={className} onError={onError}/></button>
    {open && <dialog ref={dialog} className="photo-lightbox" aria-label={alt} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}><button className="chip" autoFocus onClick={() => setOpen(false)}>Close photo</button><img src={src} alt={alt}/></dialog>}
  </>;
}
