export function readTheme(value) {
  return value === 'dark' ? 'dark' : 'light';
}

export function nextTheme(current) {
  return readTheme(current) === 'dark' ? 'light' : 'dark';
}
