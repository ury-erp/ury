import { useState } from 'react';

/** First letters of the first two words of a name, e.g. "John Doe" -> "JD". */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

interface WaiterAvatarProps {
  name: string;
  image?: string | null;
  size?: number;
  className?: string;
}

/**
 * Round employee avatar: shows the image when available, otherwise the
 * initials on a neutral background. Falls back to initials if the image
 * fails to load. Shared by the waiter picker and the order details panel.
 */
export function WaiterAvatar({ name, image, size = 44, className = '' }: WaiterAvatarProps) {
  const [errored, setErrored] = useState(false);
  const showImage = image && !errored;
  return (
    <div
      className={`shrink-0 rounded-full overflow-hidden bg-primary-100 text-primary-700 flex items-center justify-center font-semibold ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size / 2.6) }}
    >
      {showImage ? (
        <img
          src={image as string}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <span>{initialsOf(name)}</span>
      )}
    </div>
  );
}
