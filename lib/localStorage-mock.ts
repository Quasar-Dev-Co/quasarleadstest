// Mock localStorage for server-side rendering.
// IMPORTANT: Never assign `global.window` on the server. Doing so defeats
// every `typeof window === "undefined"` guard in the app and in third-party
// libraries (Radix UI, next-themes, react-hot-toast, sonner, etc.), causing
// them to run browser-only code on the server and crash during SSR — which
// surfaces as "Application error: a client-side exception has occurred".
//
// All browser API access in this codebase is already guarded with
// `typeof window === "undefined"` and uses `window.localStorage` (not bare
// `localStorage`), so this mock is not strictly required. It is kept only as
// a harmless safety net for any code that might reference `localStorage`
// directly.
if (typeof window === 'undefined') {
  const mockLocalStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0
  };

  // @ts-ignore
  global.localStorage = mockLocalStorage;
}

export {};
