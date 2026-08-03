const contract = "0x7519855640cDBe8600CFF13fd98983A1bBFE46e0";
const panels = [...document.querySelectorAll("[data-panel]")];
const tabs = [...document.querySelectorAll("[data-tab]")];
const portrait = document.querySelector("#portrait");
const portraitStatus = document.querySelector("#portrait-status");
const portraitAgent = document.querySelector("#portrait-agent");
const tokenForm = document.querySelector("#token-form");
const tokenInput = document.querySelector("#token-id");

function selectTab(name, updateHash = true) {
  const selected = name === "api" ? "api" : "docs";
  for (const panel of panels) panel.hidden = panel.dataset.panel !== selected;
  for (const tab of tabs) tab.setAttribute("aria-selected", String(tab.dataset.tab === selected));
  if (updateHash) history.replaceState(null, "", `#${selected}`);
  document.title = selected === "api" ? "Census — public API" : "Census — documentation";
}

for (const tab of tabs) tab.addEventListener("click", () => selectTab(tab.dataset.tab));
for (const button of document.querySelectorAll("[data-open-tab]")) {
  button.addEventListener("click", () => {
    selectTab(button.dataset.openTab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

async function loadPortrait(tokenId) {
  portrait.classList.remove("ready");
  portrait.removeAttribute("src");
  portraitStatus.textContent = "Reading Sepolia…";
  portraitAgent.textContent = "—";
  try {
    const response = await fetch(`/a/${contract}/${tokenId}/registration.json`, {
      headers: { Accept: "application/json" },
    });
    if (response.status === 404) throw new Error("Token not found");
    if (!response.ok) throw new Error("Chain data unavailable");
    const registration = await response.json();
    const image = registration.image;
    const agentId = registration.registrations?.[0]?.agentId;
    if (typeof image !== "string" || !image.startsWith("data:image/svg+xml;base64,")) {
      throw new Error("Invalid onchain image");
    }
    portrait.addEventListener("load", () => portrait.classList.add("ready"), { once: true });
    portrait.src = image;
    portrait.alt = `Census token ${tokenId} one-bit onchain portrait`;
    portraitStatus.textContent = `Census #${tokenId} · live`;
    portraitAgent.textContent = Number.isSafeInteger(agentId) ? `ERC-8004 #${agentId}` : "Binding unavailable";
  } catch (error) {
    portraitStatus.textContent = error instanceof Error ? error.message : "Preview unavailable";
  }
}

tokenForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const raw = tokenInput.value.trim();
  if (!/^[1-9][0-9]{0,3}$/.test(raw)) {
    portraitStatus.textContent = "Enter a token ID from 1 to 5000";
    return;
  }
  loadPortrait(raw);
});

for (const button of document.querySelectorAll("[data-copy-target]")) {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copyTarget);
    if (!target) return;
    const value = target.textContent.trim();
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = button.dataset.copyTarget === "prompt-text" ? "Copy prompt" : "Copy"; }, 1400);
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = "Selected";
    }
  });
}

selectTab(location.hash.slice(1), false);
loadPortrait("3");
