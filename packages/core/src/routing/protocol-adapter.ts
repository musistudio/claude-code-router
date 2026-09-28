const geminiGenerateContentPathPattern = /(\/v1(?:beta)?\/models\/)([^/:]+)(:(?:generatecontent|streamgeneratecontent))/i;

export type RouteProtocolAdaptation = {
  body: Record<string, unknown>;
  modelLocation: "body" | "path";
};

export function adaptRouteRequestBody(
  path: string,
  body: Record<string, unknown>
): RouteProtocolAdaptation {
  const pathModel = routeModelFromPath(path);
  return pathModel
    ? { body: { ...body, model: pathModel }, modelLocation: "path" }
    : { body, modelLocation: "body" };
}

export function restoreRouteRequestBody(
  body: Record<string, unknown>,
  adaptation: Pick<RouteProtocolAdaptation, "modelLocation">
): Record<string, unknown> {
  if (adaptation.modelLocation !== "path") {
    return body;
  }
  const next = { ...body };
  delete next.model;
  return next;
}

export function rewriteRouteModelInUrl(url: string, model: string | undefined): string {
  if (!model || !geminiGenerateContentPathPattern.test(url)) {
    geminiGenerateContentPathPattern.lastIndex = 0;
    return url;
  }
  geminiGenerateContentPathPattern.lastIndex = 0;
  return url.replace(
    geminiGenerateContentPathPattern,
    (_match, prefix: string, _current: string, suffix: string) => `${prefix}${encodeURIComponent(model)}${suffix}`
  );
}

export function routeModelFromPath(path: string): string | undefined {
  const match = geminiGenerateContentPathPattern.exec(path);
  geminiGenerateContentPathPattern.lastIndex = 0;
  if (!match?.[2]) {
    return undefined;
  }
  try {
    return decodeURIComponent(match[2]);
  } catch {
    return match[2];
  }
}
