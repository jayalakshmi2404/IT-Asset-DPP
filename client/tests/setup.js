import '@testing-library/jest-dom/vitest';

// jsdom does not implement these; components only use them for layout effects.
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
}
