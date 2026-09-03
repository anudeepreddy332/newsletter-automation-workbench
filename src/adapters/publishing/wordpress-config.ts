export const WORDPRESS_SITE_ID_ENV = "WORDPRESS_SITE_ID";
export const WORDPRESS_ACCESS_TOKEN_ENV = "WORDPRESS_ACCESS_TOKEN";

export type RealWordPressConfig = {
  siteId: string;
  accessToken: string;
};

export function readRealWordPressConfig(
  env: NodeJS.Dict<string> = process.env,
): RealWordPressConfig | null {
  const siteId = env[WORDPRESS_SITE_ID_ENV]?.trim() ?? "";
  const accessToken = env[WORDPRESS_ACCESS_TOKEN_ENV]?.trim() ?? "";

  if (!/^\d+$/.test(siteId) || accessToken.length === 0) {
    return null;
  }

  return { siteId, accessToken };
}
