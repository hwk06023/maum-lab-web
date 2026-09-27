// Presentation only: keep the original transcript and signed request data intact.
export const displayText = (text: string) => text.replace(/\s*·\s*/g, ', ');
