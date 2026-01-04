export const formatBase64 = (data: string, media_type: string) => {
  if (data.includes("base64")) {
    data = data.split("base64").pop() as string;
    if (data.startsWith(",")) {
      data = data.slice(1);
    }
  }
  return `data:${media_type};base64,${data}`;
};
