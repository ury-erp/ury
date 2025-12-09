import qz from 'qz-tray';

// Expose QZ Tray globally so it's available as window.qz
if (typeof window !== 'undefined') {
  (window as any).qz = qz;
  console.log('✅ QZ Tray exposed globally as window.qz');
}

export default qz;
