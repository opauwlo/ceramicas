/** Um toquezinho de vibração, para sentir a massa na mão. Em aparelho sem vibração não faz nada. */
export function buzz(ms = 8): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
  } catch {
    // alguns navegadores bloqueiam fora de um toque; tudo bem
  }
}
