/** The hosted BIZ Mbee build uses Vietnamese; upstream development keeps its locale. */
export function uiText(english: string, vietnamese: string): string {
  return process.env.WEBMCP_CLOUD_URL ? vietnamese : english;
}
