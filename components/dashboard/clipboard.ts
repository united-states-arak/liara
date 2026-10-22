export async function copyText(text: string | Promise<string>): Promise<boolean> {
  // Passing a ClipboardItem with a pending promise keeps the copy inside the
  // user gesture, which Safari requires when the text is fetched first.
  if (
    typeof text !== "string" &&
    typeof ClipboardItem !== "undefined" &&
    navigator.clipboard?.write
  ) {
    try {
      const blob = text.then((value) => new Blob([value], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return true;
    } catch {
      // Fall through to the plain-text paths below.
    }
  }

  const value = await text;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  return legacyCopy(value);
}

function legacyCopy(value: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, value.length);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
