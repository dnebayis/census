const portrait = document.querySelector("#portrait");
const portraitStatus = document.querySelector("#portrait-status");
const copyButton = document.querySelector("#copy-prompt");
const promptText = document.querySelector("#prompt-text");

const fallbackContract = "0xEC36917c75B7e40601a0255bfc8EE4FABc61B4ab";
const contract = document.documentElement.dataset.census || fallbackContract;

async function loadPortrait() {
  try {
    const response = await fetch(`/a/${contract}/1/registration.json`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("portrait unavailable");
    const registration = await response.json();
    if (typeof registration.image !== "string" || !registration.image.startsWith("data:image/svg+xml;base64,")) {
      throw new Error("invalid portrait image");
    }
    portrait.src = registration.image;
    portrait.addEventListener("load", () => portrait.classList.add("ready"), { once: true });
    portraitStatus.textContent = "Live onchain portrait · Census #1";
  } catch {
    portraitStatus.textContent = "Onchain portrait temporarily unavailable";
  }
}

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(promptText.textContent.trim());
    copyButton.textContent = "Copied";
    window.setTimeout(() => { copyButton.textContent = "Copy prompt"; }, 1600);
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(promptText);
    selection.removeAllRanges();
    selection.addRange(range);
    copyButton.textContent = "Selected — copy it";
  }
});

loadPortrait();
