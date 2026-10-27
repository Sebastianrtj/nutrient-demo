/** One base for standalone development and subpath hosting. */
export const appUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
