const API_GATEWAY_PARAM_RE = /(^|\/):([A-Za-z0-9_]+(?:[+*])?)(?=\/|$)/g;

export function normalizeRouterPath(path: string): string {
  return path.replace(/\{([^/{}]+)\}/g, ":$1");
}

export function normalizeApiGatewayPath(path: string): string {
  return path.replace(API_GATEWAY_PARAM_RE, (_match, prefix: string, name: string) => `${prefix}{${name}}`);
}
