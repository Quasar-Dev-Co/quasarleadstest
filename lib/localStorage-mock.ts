// Mock localStorage and window for server-side rendering
if (typeof window === 'undefined') {
  // Create a mock localStorage object for SSR
  const mockLocalStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0
  };

  // Create a mock location object for SSR
  const mockLocation = {
    protocol: 'http:',
    host: 'localhost:3000',
    hostname: 'localhost',
    port: '3000',
    pathname: '/',
    search: '',
    hash: '',
    href: 'http://localhost:3000/',
    origin: 'http://localhost:3000',
    ancestorOrigins: {} as unknown as DOMStringList,
    assign: () => {},
    reload: () => {},
    replace: () => {}
  } as unknown as Location;

  // @ts-ignore
  global.localStorage = mockLocalStorage;
  // @ts-ignore
  global.window = { 
    localStorage: mockLocalStorage,
    location: mockLocation
  };
}

export {};
