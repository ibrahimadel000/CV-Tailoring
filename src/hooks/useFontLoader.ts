import { useState, useEffect } from 'react';
import { Font } from '@react-pdf/renderer';

let fontsRegistered = false;

export function useFontLoader() {
  const [isLoaded, setIsLoaded] = useState(fontsRegistered);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fontsRegistered) return;

    try {
      Font.register({
        family: 'Inter',
        fonts: [
          { src: '/fonts/Inter-Regular.ttf', fontWeight: 400 },
          { src: '/fonts/Inter-Medium.ttf', fontWeight: 500 },
          { src: '/fonts/Inter-Bold.ttf', fontWeight: 700 }
        ]
      });
      fontsRegistered = true;
      setIsLoaded(true);
    } catch (err: any) {
      console.error('Failed to register PDF fonts:', err);
      setError('Failed to load PDF fonts. Please ensure the public/fonts directory is populated.');
    }
  }, []);

  return { isLoaded, error };
}
