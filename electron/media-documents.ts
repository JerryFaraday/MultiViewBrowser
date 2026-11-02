/** Visit only accessible same-origin documents. Never relax iframe security. */
export function mediaDocuments(root: Document): Document[] {
  const documents = [root],
    seen = new Set<Document>(documents);
  for (let i = 0; i < documents.length; i++)
    for (const frame of documents[i].querySelectorAll("iframe")) {
      try {
        const child = frame.contentDocument;
        if (child && !seen.has(child)) {
          seen.add(child);
          documents.push(child);
        }
      } catch {
        /* Cross-origin frame: retain isolation. */
      }
    }
  return documents;
}
