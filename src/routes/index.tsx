import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, Copy, File, FileArchive, FileImage, FileText, FolderUp, Link2, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Send Anywhere — Simple file sharing demo" },
      { name: "description", content: "A lightweight file transfer demo for sharing files with a short code." },
      { property: "og:title", content: "Send Anywhere — Simple file sharing demo" },
      { property: "og:description", content: "A lightweight file transfer demo for sharing files with a short code." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Mode = "send" | "receive";

export function isValidTransferCode(code: string) {
  return /^\d{6}$/.test(code);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension ?? "")) return FileImage;
  if (["zip", "rar", "7z", "tar", "gz"].includes(extension ?? "")) return FileArchive;
  if (["txt", "pdf", "doc", "docx", "md"].includes(extension ?? "")) return FileText;
  return File;
}

function Index() {
  const [mode, setMode] = useState<Mode>("send");
  const [files, setFiles] = useState<File[]>([]);
  const [transferCode, setTransferCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [receiveCode, setReceiveCode] = useState("");
  const [receiveMessage, setReceiveMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const newFiles = Array.from(incoming);
    setFiles((current) => [...current, ...newFiles.filter((file) => !current.some((existing) => existing.name === file.name && existing.size === file.size))]);
    setTransferCode("");
  }

  function generateCode() {
    const code = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join("");
    setTransferCode(code);
    setCopied(false);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(transferCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setReceiveMessage("");
  }

  function validateCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReceiveMessage(isValidTransferCode(receiveCode) ? "Code accepted for this demo. Files are not sent between devices." : "Enter a valid 6-digit code.");
  }

  return (
    <main className="transfer-page min-h-screen px-5 pb-14 pt-7 sm:px-8 sm:pt-9">
      <div className="mx-auto max-w-[980px]">
        <header className="flex items-center justify-between">
          <a className="brand-lockup" href="/" aria-label="Send Anywhere home">
            <span className="brand-mark" aria-hidden="true"><ArrowRight size={20} strokeWidth={2.7} /><ArrowLeft size={16} strokeWidth={2.7} /></span>
          <span className="font-display text-lg font-bold">send<span className="brand-name-light">anywhere</span></span>
          </a>
          <span className="header-note hidden sm:block">A small file-sharing demo</span>
        </header>

        <section className="transfer-intro">
          <div className="intro-copy">
            <p className="eyebrow">FILE TRANSFER · MADE SIMPLE</p>
            <h1>Move files.<br /><span>Keep it easy.</span></h1>
            <p className="intro-description">Pick a file to share, or enter a code to receive one.</p>
          </div>
          <div className="intro-illustration" aria-hidden="true">
            <div className="illustration-sheet"><File size={43} strokeWidth={1.25} /><span /><span /><span /></div>
            <div className="illustration-arrow"><ArrowRight size={25} /></div>
            <div className="illustration-spark spark-one" /><div className="illustration-spark spark-two" />
          </div>
        </section>

        <section className="transfer-panel" aria-label="File transfer">
          <div className="mode-tabs" role="tablist" aria-label="Transfer mode">
            <Button variant="ghost" className={`mode-tab ${mode === "send" ? "mode-tab-active" : ""}`} onClick={() => changeMode("send")} role="tab" aria-selected={mode === "send"} type="button">
              <ArrowRight size={17} /> Send files
            </Button>
            <Button variant="ghost" className={`mode-tab ${mode === "receive" ? "mode-tab-active" : ""}`} onClick={() => changeMode("receive")} role="tab" aria-selected={mode === "receive"} type="button">
              <ArrowDownToLine size={17} /> Receive files
            </Button>
          </div>

          {mode === "send" ? (
            <div className="panel-content">
              <div className={`drop-zone ${isDragging ? "drop-zone-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); addFiles(event.dataTransfer.files); }}>
                <input ref={inputRef} className="sr-only" type="file" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} aria-label="Choose files to send" />
                <div className="upload-icon"><FolderUp size={24} strokeWidth={1.8} /></div>
                <h2>Send something</h2>
                <p>Drag your files here, or choose from your device.</p>
                <Button variant="outline" size="sm" className="choose-button" onClick={() => inputRef.current?.click()} type="button">
                  <FolderUp size={16} /> Choose files
                </Button>
                <p className="size-note">Any file type · no account needed</p>
              </div>

              {files.length > 0 && (
                <div className="file-list-block">
                  <div className="list-heading"><span>Your files <span className="file-count">{files.length}</span></span><span>{formatBytes(totalBytes)} total</span></div>
                  <ul className="file-list">
                    {files.map((file, index) => {
                      const Icon = fileIcon(file.name);
                      return <li className="file-row" key={`${file.name}-${file.size}-${index}`}><span className="file-type-icon"><Icon size={18} /></span><span className="file-detail"><span className="file-name">{file.name}</span><span className="file-size">{formatBytes(file.size)}</span></span><Button variant="ghost" size="icon" className="remove-file" type="button" aria-label={`Remove ${file.name}`} onClick={() => { setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index)); setTransferCode(""); }}><X size={17} /></Button></li>;
                    })}
                  </ul>
                  {transferCode ? (
                    <div className="code-result" aria-live="polite">
                      <div className="code-result-heading"><span className="code-success-icon"><Check size={15} /></span><span>Ready to share</span></div>
                      <p>Share this code with the person receiving your files.</p>
                      <div className="code-share-row"><span className="transfer-code" aria-label={`Transfer code ${transferCode}`}>{transferCode.split("").map((digit, index) => <span key={`${digit}-${index}`}>{digit}</span>)}</span><Button variant="outline" size="icon" className="copy-button" aria-label={copied ? "Code copied" : "Copy code"} title={copied ? "Copied" : "Copy code"} onClick={copyCode} type="button">{copied ? <Check size={17} /> : <Copy size={17} />}</Button></div>
                      <p className="demo-note">Demo only — files stay on this device.</p>
                    </div>
                  ) : (
                    <Button className="create-code-button" onClick={generateCode} type="button"><Link2 size={17} /> Create transfer code</Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="panel-content receive-content">
              <div className="receive-icon"><ArrowDownToLine size={23} /></div>
              <h2>Enter a transfer code</h2>
              <p className="receive-description">Type the 6-digit code shared with you.</p>
              <form className="receive-form" onSubmit={validateCode}>
                <label className="sr-only" htmlFor="receive-code">6-digit transfer code</label>
                <Input id="receive-code" className="receive-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000 000" value={receiveCode} onChange={(event) => { setReceiveCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setReceiveMessage(""); }} />
                <Button className="receive-button" type="submit" disabled={receiveCode.length !== 6}>Continue <ArrowRight size={16} /></Button>
              </form>
              {receiveMessage && <p className={`receive-message ${/^Code accepted/.test(receiveMessage) ? "receive-message-success" : "receive-message-error"}`} aria-live="polite">{receiveMessage}</p>}
              <div className="receive-footnote"><ShieldCheck size={15} /><span>No account needed. This demo doesn't upload or transfer files.</span></div>
            </div>
          )}
        </section>

        <footer className="page-footer"><span>Simple transfers, one code at a time.</span><span>Built as a college project</span></footer>
      </div>
    </main>
  );
}