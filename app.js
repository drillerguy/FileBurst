import { PDFDocument } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";

const $ = (id) => document.getElementById(id);
const state = { sourceFile: null, parts: [], current: 0, sent: new Set(), busy: false };

const els = {
  pdfInput: $("pdfInput"), dropzone: $("dropzone"), dropTitle: $("dropTitle"), dropDetail: $("dropDetail"),
  fileCard: $("fileCard"), fileName: $("fileName"), fileMeta: $("fileMeta"), clearFile: $("clearFile"),
  recipient: $("recipient"), targetSize: $("targetSize"), splitButton: $("splitButton"),
  setupPanel: $("setupPanel"), queuePanel: $("queuePanel"), queueTitle: $("queueTitle"),
  progressBar: $("progressBar"), progressLabel: $("progressLabel"), partNumber: $("partNumber"),
  partName: $("partName"), partSize: $("partSize"), partStatus: $("partStatus"), sendButton: $("sendButton"),
  sendButtonText: $("sendButtonText"), downloadButton: $("downloadButton"), startOver: $("startOver"),
  queueNote: $("queueNote"), devicePill: $("devicePill"), toast: $("toast")
};

function deviceMode() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone · guided send";
  if (/Android/i.test(ua)) return "Android · guided send";
  return "Web · share or download";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function safeBaseName(name) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9 _.-]/gi, "").trim() || "FileBurst";
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove("show"), 2300);
}

function selectFile(file) {
  if (!file || (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))) {
    toast("Please choose a PDF file.");
    return;
  }
  state.sourceFile = file;
  els.fileName.textContent = file.name;
  els.fileMeta.textContent = `${formatBytes(file.size)} · ready to prepare`;
  els.dropzone.classList.add("hidden");
  els.fileCard.classList.remove("hidden");
  els.splitButton.disabled = false;
}

function clearFile() {
  state.sourceFile = null;
  els.pdfInput.value = "";
  els.fileCard.classList.add("hidden");
  els.dropzone.classList.remove("hidden");
  els.splitButton.disabled = true;
}

async function makePdfPart(sourcePdf, pageIndexes) {
  const part = await PDFDocument.create();
  const pages = await part.copyPages(sourcePdf, pageIndexes);
  pages.forEach((page) => part.addPage(page));
  const bytes = await part.save({ useObjectStreams: true });
  return bytes;
}

async function splitPdf() {
  if (!state.sourceFile || state.busy) return;
  state.busy = true;
  els.splitButton.disabled = true;
  els.splitButton.firstElementChild.textContent = "Reading PDF…";

  try {
    const sourceBytes = await state.sourceFile.arrayBuffer();
    const pdf = await PDFDocument.load(sourceBytes, { ignoreEncryption: false });
    const maxBytes = Number(els.targetSize.value) * 1024 * 1024;
    const rawParts = [];
    let currentIndexes = [];

    for (let i = 0; i < pdf.getPageCount(); i += 1) {
      els.splitButton.firstElementChild.textContent = `Checking page ${i + 1} of ${pdf.getPageCount()}…`;
      const candidateIndexes = [...currentIndexes, i];
      const candidateBytes = await makePdfPart(pdf, candidateIndexes);

      if (candidateBytes.length > maxBytes && currentIndexes.length) {
        rawParts.push(await makePdfPart(pdf, currentIndexes));
        currentIndexes = [i];
      } else {
        currentIndexes = candidateIndexes;
      }
    }

    if (currentIndexes.length) rawParts.push(await makePdfPart(pdf, currentIndexes));

    const countWidth = Math.max(2, String(rawParts.length).length);
    const base = safeBaseName(state.sourceFile.name);
    state.parts = rawParts.map((bytes, index) => {
      const label = String(index + 1).padStart(countWidth, "0");
      const name = `${base} - Part ${label} of ${rawParts.length}.pdf`;
      return { name, blob: new Blob([bytes], { type: "application/pdf" }), size: bytes.length };
    });
    state.current = 0;
    state.sent.clear();
    localStorage.setItem("fileburst.recipient", els.recipient.value.trim());
    showQueue();
  } catch (error) {
    console.error(error);
    toast(error?.message?.toLowerCase().includes("encrypted") ? "That PDF is password protected." : "FileBurst could not read this PDF.");
  } finally {
    state.busy = false;
    els.splitButton.disabled = !state.sourceFile;
    els.splitButton.firstElementChild.textContent = "Prepare FileBurst";
  }
}

function showQueue() {
  els.setupPanel.classList.add("hidden");
  els.queuePanel.classList.remove("hidden");
  els.queueTitle.textContent = `${state.parts.length} part${state.parts.length === 1 ? "" : "s"} prepared`;
  updateQueue();
}

function updateQueue() {
  const total = state.parts.length;
  const complete = state.current >= total;
  const sentCount = state.sent.size;
  els.progressBar.style.width = `${total ? (sentCount / total) * 100 : 0}%`;
  els.progressLabel.textContent = `${sentCount} of ${total} sent`;

  if (complete) {
    els.partNumber.textContent = "✓";
    els.partName.textContent = "FileBurst complete";
    els.partSize.textContent = `All ${total} parts were opened for sending.`;
    els.partStatus.textContent = "DONE";
    els.sendButtonText.textContent = "Finished";
    els.sendButton.disabled = true;
    els.downloadButton.classList.add("hidden");
    els.queueNote.textContent = "Your complete sending sequence is finished.";
    return;
  }

  const part = state.parts[state.current];
  els.partNumber.textContent = String(state.current + 1).padStart(2, "0");
  els.partName.textContent = part.name;
  els.partSize.textContent = formatBytes(part.size);
  els.partStatus.textContent = "NEXT";
  els.sendButtonText.textContent = `Send part ${state.current + 1} of ${total}`;
  els.sendButton.disabled = false;
  els.downloadButton.classList.remove("hidden");
}

async function sendCurrent() {
  const part = state.parts[state.current];
  if (!part) return;
  const recipient = els.recipient.value.trim();
  const file = new File([part.blob], part.name, { type: "application/pdf" });
  const text = `${part.name}${recipient ? ` — for ${recipient}` : ""}`;

  try {
    if (window.FileBurstNative?.sharePart) {
      await window.FileBurstNative.sharePart({ recipient, name: part.name, blob: part.blob, index: state.current, total: state.parts.length });
    } else if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: part.name, text });
    } else {
      downloadCurrent();
      toast("Part downloaded. Attach it to your message.");
    }
    state.sent.add(state.current);
    state.current += 1;
    updateQueue();
  } catch (error) {
    if (error?.name !== "AbortError") toast("That part was not sent. Try again.");
  }
}

function downloadCurrent() {
  const part = state.parts[state.current];
  if (!part) return;
  const url = URL.createObjectURL(part.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = part.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function startOver() {
  state.parts.forEach((part) => part.blob && URL.revokeObjectURL(part.blob));
  state.parts = [];
  state.current = 0;
  state.sent.clear();
  clearFile();
  els.queuePanel.classList.add("hidden");
  els.setupPanel.classList.remove("hidden");
  els.sendButton.disabled = false;
}

els.devicePill.textContent = deviceMode();
els.recipient.value = localStorage.getItem("fileburst.recipient") || "";
els.pdfInput.addEventListener("change", (event) => selectFile(event.target.files[0]));
els.clearFile.addEventListener("click", clearFile);
els.splitButton.addEventListener("click", splitPdf);
els.sendButton.addEventListener("click", sendCurrent);
els.downloadButton.addEventListener("click", downloadCurrent);
els.startOver.addEventListener("click", startOver);

["dragenter", "dragover"].forEach((name) => els.dropzone.addEventListener(name, (event) => {
  event.preventDefault();
  els.dropzone.classList.add("dragging");
}));
["dragleave", "drop"].forEach((name) => els.dropzone.addEventListener(name, (event) => {
  event.preventDefault();
  els.dropzone.classList.remove("dragging");
}));
els.dropzone.addEventListener("drop", (event) => selectFile(event.dataTransfer.files[0]));

if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});

if (document.modelContext?.registerTool) {
  document.modelContext.registerTool({
    name: "start_fileburst",
    title: "Start FileBurst",
    description: "Open the PDF chooser so the user can select a PDF to split into message-ready parts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: async () => {
      els.pdfInput.click();
      return { status: "waiting_for_pdf" };
    }
  });
}
