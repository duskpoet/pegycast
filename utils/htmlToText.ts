const entityMap: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&ndash;": "\u2013",
  "&mdash;": "\u2014",
  "&hellip;": "\u2026",
  "&laquo;": "\u00AB",
  "&raquo;": "\u00BB",
};

function decodeEntities(text: string): string {
  return text.replace(/&[a-zA-Z]+;|&#\d+;/g, (match) => {
    if (entityMap[match]) return entityMap[match];
    const num = match.match(/&#(\d+);/);
    if (num) return String.fromCharCode(parseInt(num[1], 10));
    return match;
  });
}

function stripTags(text: string): string {
  let result = text;
  // Replace <br>, <br/>, <p>, </p> with newlines
  result = result.replace(/<br\s*\/?>/gi, "\n");
  result = result.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n");
  result = result.replace(/<\/?p[^>]*>/gi, "\n");
  // Replace <li> with bullet
  result = result.replace(/<li[^>]*>/gi, "\n\u2022 ");
  // Strip all remaining tags
  result = result.replace(/<[^>]+>/g, "");
  return result;
}

export function htmlToText(html: string): string {
  // Decode entities first so encoded tags like &lt;p&gt; become real tags
  let text = decodeEntities(html);
  // Strip tags
  text = stripTags(text);
  // Decode again in case of double-encoding
  text = decodeEntities(text);
  // If there are still tags after double-decode, strip again
  if (/<[^>]+>/.test(text)) {
    text = stripTags(text);
  }
  // Collapse multiple newlines
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
