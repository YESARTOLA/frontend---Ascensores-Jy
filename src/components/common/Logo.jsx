/**
 * Logo oficial Ascensores Jy.
 *
 *  - 'mark' (por defecto): solo el isotipo JY (J naranja + Y teal + chevron del ascensor).
 *                          Frame rectangular 1.37:1 con recorte matemáticamente exacto
 *                          que coincide con el bbox medido del archivo (x 16.4-83.4%, y 22.5-71.4%).
 *  - 'full' : el archivo completo (isotipo + nombre "ASCENSORES JY S.A.C" debajo).
 *
 *  La prop `size` controla la altura. El ancho se deriva del aspect ratio del isotipo.
 */
const ISO_ASPECT = 1.37;     // 67% / 48.9% (bbox medido del isotipo en el JPG)
const ISO_BG_SIZE = '149.3%'; // (1/0.67)*100 — la imagen al 149.3% del ancho del frame
const ISO_BG_POSY = 44;       // % vertical que centra el isotipo y deja fuera "ASCENSORES JY S.A.C"

export default function Logo({ variant = 'mark', size = 40, className = '', frame = true }) {
  const px = typeof size === 'number' ? `${size}px` : size;

  if (variant === 'full') {
    return (
      <img
        src="/logo-jy.jpg"
        alt="Ascensores Jy S.A.C"
        className={`block ${className}`}
        style={{ height: px, width: 'auto' }}
      />
    );
  }

  // Variante mark: rectángulo 1.37:1 con isotipo JY centrado píxel-perfect.
  const heightPx = typeof size === 'number' ? size : parseFloat(size);
  const widthPx  = heightPx * ISO_ASPECT;

  return (
    <div
      className={`bg-white ${frame ? 'ring-1 ring-carbon-200/80 shadow-card' : ''} ${className}`}
      style={{
        height: `${heightPx}px`,
        width:  `${widthPx}px`,
        borderRadius: '0.65rem',
        backgroundImage: 'url(/logo-jy.jpg)',
        backgroundRepeat: 'no-repeat',
        backgroundSize: ISO_BG_SIZE,
        backgroundPosition: `50% ${ISO_BG_POSY}%`
      }}
      aria-label="Ascensores Jy"
      role="img"
    />
  );
}
