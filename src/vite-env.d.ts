/// <reference types="vite/client" />

import type { ProjectApi } from '../shared/types';

declare global {
  interface Window {
    projectApi?: ProjectApi;
  }
}

export {};
