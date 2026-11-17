import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  File,
  FileArchive,
  FileImage,
  FileText,
  FolderUp,
  Link2,
  Loader2,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { TRANSFER_BUCKET, checkFiles, formatBytes, isValidTransferCode } from "@/lib/transfer-rules";
import { createTransfer, getTransfer } from "@/lib/transfers.functions";

// The router turns "?code=123456" into a number, so accept both and keep it as text.
const searchSchema = z.object({
  code: z
    .union([z.string(), z.number()])
    .transform((value) => String(value).padStart(6, "0"))
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Send Anywhere — Share files with a 6-digit code" },
      { name: "description", content: "Upload files and share them with a short code or link. No account needed." },
      { property: "og:title", content: "Send Anywhere — Share files with a 6-digit code" },
      { property: "og:description", content: "Upload files and share them with a short code or link. No account needed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Mode = "send" | "receive";
type SendState =
  | { status: "idle" }
  | { status: "uploading"; done: number; total: number }
  | { status: "ready"; code: string }
  | { status: "error"; message: string };

function fileIcon(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension ?? "")) return FileImage;
  if (["zip", "rar", "7z", "tar", "gz"].includes(extension ?? "")) return FileArchive;
  if (["txt", "pdf", "doc", "docx", "md"].includes(extension ?? "")) return FileText;
  return File;
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000);
    } catch {
      setCopied(null);
    }
  }
  return { copied, copy };
}

function Index() {
  const { code: linkCode } = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const [mode, setMode] = useState<Mode>(linkCode ? "receive" : "send");

  useEffect(() => {
    if (linkCode) setMode("receive");
  }, [linkCode]);

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    if (nextMode === "send" && linkCode) navigate({ search: {} });
  }

  return (
    <main className="transfer-page min-h-screen px-5 pb-14 pt-7 sm:px-8 sm:pt-9">
      <div className="mx-auto max-w-[980px]">
        <header className="flex items-center justify-between">
          <a className="brand-lockup" href="/" aria-label="Send Anywhere home">
            <span className="brand-mark" aria-hidden="true"><ArrowRight size={20} strokeWidth={2.7} /><ArrowLeft size={16} strokeWidth={2.7} /></span>
            <span className="font-display text-lg font-bold">send<span className="brand-name-light">anywhere</span></span>
          </a>
          <span className="header-note hidden sm:block">Share files with a short code</span>
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

          {mode === "send" ? <SendPanel /> : <ReceivePanel code={linkCode} onSubmitCode={(code) => navigate({ search: { code } })} />}
        </section>

        <footer className="page-footer"><span>Simple transfers, one code at a time.</span><span>Built as a college project</span></footer>
      </div>
    </main>
  );
}

function SendPanel() {
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<SendState>({ status: "idle" });
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { copied, copy } = useCopy();

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const locked = state.status === "uploading" || state.status === "ready";
  const fileProblem = checkFiles(files);

  function addFiles(incoming: FileList | null) {
    if (!incoming || locked) return;
    const newFiles = Array.from(incoming);
    setFiles((current) => [...current, ...newFiles.filter((file) => !current.some((existing) => existing.name === file.name && existing.size === file.size))]);
    setState({ status: "idle" });
  }

  async function send() {
    if (fileProblem) {
      setState({ status: "error", message: fileProblem });
      return;
    }
    setState({ status: "uploading", done: 0, total: files.length });
    try {
      const { code, uploads } = await createTransfer({
        data: { files: files.map((file) => ({ name: file.name, size: file.size, type: file.type })) },
      });
      let done = 0;
      await Promise.all(
        uploads.map(async (slot, index) => {
          const file = files[index];
          if (!file) return;
          const { error } = await supabase.storage
            .from(TRANSFER_BUCKET)
            .uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type || "application/octet-stream" });
          if (error) throw new Error(`"${file.name}" could not be uploaded.`);
          done += 1;
          setState({ status: "uploading", done, total: uploads.length });
        }),
      );
      setState({ status: "ready", code });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Something went wrong. Please try again." });
    }
  }

  function startOver() {
    setFiles([]);
    setState({ status: "idle" });
  }

  const shareLink = state.status === "ready" && typeof window !== "undefined" ? `${window.location.origin}/?code=${state.code}` : "";

  return (
    <div className="panel-content">
      {!locked && (
        <div className={`drop-zone ${isDragging ? "drop-zone-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); addFiles(event.dataTransfer.files); }}>
          <input ref={inputRef} className="sr-only" type="file" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} aria-label="Choose files to send" />
          <div className="upload-icon"><FolderUp size={24} strokeWidth={1.8} /></div>
          <h2>Send something</h2>
          <p>Drag your files here, or choose from your device.</p>
          <Button variant="outline" size="sm" className="choose-button" onClick={() => inputRef.current?.click()} type="button">
            <FolderUp size={16} /> Choose files
          </Button>
          <p className="size-note">Any file type · up to 50 MB each · no account needed</p>
        </div>
      )}

      {files.length > 0 && (
        <div className={locked ? "" : "file-list-block"}>
          <div className="list-heading"><span>Your files <span className="file-count">{files.length}</span></span><span>{formatBytes(totalBytes)} total</span></div>
          <ul className="file-list">
            {files.map((file, index) => {
              const Icon = fileIcon(file.name);
              return (
                <li className="file-row" key={`${file.name}-${file.size}-${index}`}>
                  <span className="file-type-icon"><Icon size={18} /></span>
                  <span className="file-detail"><span className="file-name">{file.name}</span><span className="file-size">{formatBytes(file.size)}</span></span>
                  {!locked && (
                    <Button variant="ghost" size="icon" className="remove-file" type="button" aria-label={`Remove ${file.name}`} onClick={() => { setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index)); setState({ status: "idle" }); }}><X size={17} /></Button>
                  )}
                </li>
              );
            })}
          </ul>

          {state.status === "ready" ? (
            <div className="code-result" aria-live="polite">
              <div className="code-result-heading"><span className="code-success-icon"><Check size={15} /></span><span>Ready to share</span></div>
              <p>Share this code or link with the person receiving your files.</p>
              <div className="code-share-row">
                <span className="transfer-code" aria-label={`Transfer code ${state.code}`}>{state.code.split("").map((digit, index) => <span key={`${digit}-${index}`}>{digit}</span>)}</span>
                <Button variant="outline" size="icon" className="copy-button" aria-label={copied === "code" ? "Code copied" : "Copy code"} title={copied === "code" ? "Copied" : "Copy code"} onClick={() => copy("code", state.code)} type="button">{copied === "code" ? <Check size={17} /> : <Copy size={17} />}</Button>
              </div>
              <div className="share-link-row">
                <Link2 size={15} className="share-link-icon" />
                <span className="share-link-text">{shareLink}</span>
                <Button variant="outline" size="sm" onClick={() => copy("link", shareLink)} type="button">{copied === "link" ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy link</>}</Button>
              </div>
              <Button variant="ghost" size="sm" className="start-over" onClick={startOver} type="button"><RotateCcw size={15} /> Send more files</Button>
            </div>
          ) : state.status === "uploading" ? (
            <Button className="create-code-button" disabled type="button"><Loader2 size={17} className="animate-spin" /> Uploading {state.done} of {state.total}…</Button>
          ) : (
            <>
              <Button className="create-code-button" onClick={send} type="button"><Link2 size={17} /> Upload &amp; create code</Button>
              {state.status === "error" && <p className="receive-message receive-message-error" role="alert">{state.message}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ReceivePanel({ code, onSubmitCode }: { code?: string | undefined; onSubmitCode: (code: string) => void }) {
  const validCode = code && isValidTransferCode(code) ? code : undefined;
  const [input, setInput] = useState(validCode ?? "");

  useEffect(() => {
    if (validCode) setInput(validCode);
  }, [validCode]);

  const transfer = useQuery({
    queryKey: ["transfer", validCode],
    queryFn: () => getTransfer({ data: { code: validCode! } }),
    enabled: Boolean(validCode),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isValidTransferCode(input)) onSubmitCode(input);
  }

  const backendUrl = import.meta.env["VITE_SUPABASE_URL"] as string;
  const result = transfer.data;
  const showResult = validCode && result?.found;

  return (
    <div className="panel-content receive-content">
      <div className="receive-icon"><ArrowDownToLine size={23} /></div>
      <h2>Enter a transfer code</h2>
      <p className="receive-description">Type the 6-digit code shared with you.</p>
      <form className="receive-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="receive-code">6-digit transfer code</label>
        <Input id="receive-code" className="receive-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000 000" value={input} onChange={(event) => setInput(event.target.value.replace(/\D/g, "").slice(0, 6))} />
        <Button className="receive-button" type="submit" disabled={input.length !== 6 || transfer.isFetching}>
          {transfer.isFetching ? <Loader2 size={16} className="animate-spin" /> : <>Continue <ArrowRight size={16} /></>}
        </Button>
      </form>

      {code && !validCode && <p className="receive-message receive-message-error" role="alert">That link has an invalid code.</p>}
      {transfer.isError && <p className="receive-message receive-message-error" role="alert">Couldn't look up that code. Please try again.</p>}
      {validCode && result && !result.found && <p className="receive-message receive-message-error" role="alert">No files found for code {validCode}.</p>}

      {showResult && (
        <div className="received-block" aria-live="polite">
          <div className="list-heading">
            <span>Files to download <span className="file-count">{result.files.length}</span></span>
            <span>{formatBytes(result.files.reduce((sum, file) => sum + file.size, 0))} total</span>
          </div>
          <ul className="file-list">
            {result.files.map((file) => {
              const Icon = fileIcon(file.name);
              return (
                <li className="file-row" key={file.id}>
                  <span className="file-type-icon"><Icon size={18} /></span>
                  <span className="file-detail"><span className="file-name">{file.name}</span><span className="file-size">{file.downloadPath ? formatBytes(file.size) : "Still uploading or unavailable"}</span></span>
                  {file.downloadPath && (
                    <Button asChild variant="outline" size="sm">
                      <a href={`${backendUrl}${file.downloadPath}`} download={file.name}><Download size={15} /> Download</a>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="receive-footnote"><ShieldCheck size={15} /><span>No account needed. Only people with the code can see these files.</span></div>
    </div>
  );
}
