import React from 'react';
import { Spinner } from './spinner';

/**
 * @deprecated Use `Spinner` directly. Kept as a thin wrapper so existing
 * `import Loader from '@ury/ui'` call sites keep working with one visual
 * implementation instead of two divergent loading indicators.
 */
const Loader: React.FC<{ message?: string }> = ({ message }) => {
  return <Spinner message={message} className="h-7 w-7 border-2" />;
};

export default Loader;
