import { createContext, useContext } from 'react';

export const TracerContext = createContext(null);

export function useTracer() {
  return useContext(TracerContext);
}
