const allowedTags = new Set(["A", "BLOCKQUOTE", "BR", "EM", "H2", "H3", "IMG", "LI", "OL", "P", "STRONG", "UL"]);
const allowedAttributes = new Set(["href", "target", "rel"]);

function isBackendMediaUrl(value: string): boolean {
  try {
    const image = new URL(value, window.location.origin);
    const api = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000");
    return image.origin === api.origin && /^\/media\/public\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(image.pathname);
  } catch {
    return false;
  }
}

export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return "";

  const template = document.createElement("template");
  template.innerHTML = html;

  const nodes = template.content.querySelectorAll("*");
  nodes.forEach((node) => {
    if (node.tagName === "IMG") {
      const source = node.getAttribute("src") ?? "";
      const alt = node.getAttribute("alt") ?? "";
      if (!isBackendMediaUrl(source) || !alt.trim()) {
        node.remove();
        return;
      }
      Array.from(node.attributes).forEach((attribute) => {
        if (attribute.name !== "src" && attribute.name !== "alt") node.removeAttribute(attribute.name);
      });
      return;
    }

    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(...Array.from(node.childNodes));
      return;
    }

    Array.from(node.attributes).forEach((attribute) => {
      if (!allowedAttributes.has(attribute.name)) node.removeAttribute(attribute.name);
    });

    if (node.tagName === "A") {
      const href = node.getAttribute("href") ?? "";
      if (!/^https?:\/\//i.test(href)) node.removeAttribute("href");
      node.setAttribute("rel", "noreferrer");
      node.setAttribute("target", "_blank");
    }
  });

  return template.innerHTML;
}
