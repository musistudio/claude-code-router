// Convert an Anthropic image content block to an OpenAI-compatible image_url part
export const toImageUrlPart = (img: any) => ({
  type: "image_url",
  image_url: {
    url:
      img.source?.type === "base64"
        ? formatBase64(img.source.data, img.source.media_type)
        : img.source.url,
  },
  media_type: img.source.media_type,
});

export const formatBase64 = (data: string, media_type: string) => {
  if (data.includes("base64")) {
    data = data.split("base64").pop() as string;
    if (data.startsWith(",")) {
      data = data.slice(1);
    }
  }
  return `data:${media_type};base64,${data}`;
};
