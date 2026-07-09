/**
 * Generate a default avatar URL using UI Avatars service
 * This creates a consistent avatar image based on the user's name
 */
export function getDefaultAvatarUrl(name: string | null | undefined, email: string | null | undefined): string {
  const displayName = (name || email?.split('@')[0] || 'User');
  const initials = (displayName || '')
    .split(' ')
    .map(part => part?.[0] || '')
    .join('')
    .toUpperCase()
    .substring(0, 2) || 'U';
  
  const safeEmail = email || '';
  
  // Use UI Avatars API with custom styling
  const params = new URLSearchParams({
    name: initials,
    background: '7c3aed', // Purple color
    color: 'ffffff', // White text
    size: '200',
    bold: 'true',
    format: 'svg'
  });
  
  return `https://ui-avatars.com/api/?${params.toString()}`;
}

/**
 * Get avatar URL, falling back to default if none provided
 */
export function getAvatarUrl(avatarUrl: string | null | undefined, name: string | null | undefined, email: string | null | undefined): string {
  if (avatarUrl) {
    return avatarUrl;
  }
  return getDefaultAvatarUrl(name, email);
}
