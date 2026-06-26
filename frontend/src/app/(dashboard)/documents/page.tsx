"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Document as DocType } from "@/types";
import {
  Upload,
  FileText,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  X,
} from "lucide-react";

const MAX_SIZE_MB = parseInt(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB || "50");

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: React.ElementType; label: string; className: string }> = {
    uploading: { icon: Clock, label: "Uploading", className: "bg-yellow-500/10 text-yellow-500" },
    processing: { icon: RefreshCw, label: "Processing", className: "bg-blue-500/10 text-blue-500" },
    ready: { icon: CheckCircle2, label: "Ready", className: "bg-green-500/10 text-green-500" },
    failed: { icon: XCircle, label: "Failed", className: "bg-red-500/10 text-red-500" },
  };
  const { icon: Icon, label, className } = config[status] || config.processing;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      <Icon className={`h-3 w-3 ${status === "processing" ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const data = await api.listDocuments();
      setDocuments(data.documents);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch documents";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll for processing documents
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    const processingDocs = documents.filter((d) => d.status === "processing" || d.status === "uploading");
    if (processingDocs.length > 0) {
      pollingRef.current = setInterval(async () => {
        let changed = false;
        for (const doc of processingDocs) {
          try {
            const status = await api.getDocumentStatus(doc.id);
            if (status.status !== doc.status) {
              changed = true;
              if (status.status === "ready") {
                toast.success(`"${doc.original_filename}" processed successfully!`);
              } else if (status.status === "failed") {
                toast.error(`"${doc.original_filename}" failed: ${status.error_message || "Unknown error"}`);
              }
            }
          } catch { /* ignore polling errors */ }
        }
        if (changed) fetchDocuments();
      }, 3000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [documents, fetchDocuments]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are accepted.");
      return;
    }

    // Validate size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_SIZE_MB) {
      toast.error(`File too large (${sizeMB.toFixed(1)} MB). Maximum size is ${MAX_SIZE_MB} MB.`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setShowUploadModal(true);

    try {
      await api.uploadDocument(file, (pct) => setUploadProgress(pct));
      toast.success(`"${file.name}" uploaded! Processing will start automatically.`);
      setShowUploadModal(false);
      fetchDocuments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (doc: DocType) => {
    if (!confirm(`Delete "${doc.original_filename}"? This action cannot be undone.`)) return;
    setDeleting(doc.id);
    try {
      await api.deleteDocument(doc.id);
      toast.success(`"${doc.original_filename}" deleted.`);
      fetchDocuments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      toast.error(msg);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">Upload PDFs and manage your knowledge base</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          <Upload className="h-4 w-4" />
          Upload PDF
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleFileSelect}
            disabled={uploading}
          />
        </label>
      </div>

      {/* Upload progress modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Uploading Document</h3>
              <button onClick={() => setShowUploadModal(false)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">{uploadProgress}% uploaded</p>
            </div>
          </div>
        </div>
      )}

      {/* Documents grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-20">
          <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-semibold text-lg">No documents yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Upload your first PDF to get started</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="group rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                  <FileText className="h-5 w-5 text-red-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium text-sm" title={doc.original_filename}>
                    {doc.original_filename}
                  </h3>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatBytes(doc.file_size)}</span>
                    {doc.page_count && <span>• {doc.page_count} pages</span>}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <StatusBadge status={doc.status} />
                <button
                  onClick={() => handleDelete(doc)}
                  disabled={deleting === doc.id}
                  className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100 disabled:opacity-50"
                  title="Delete document"
                >
                  {deleting === doc.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>

              {doc.status === "failed" && doc.error_message && (
                <p className="mt-2 text-xs text-red-400 line-clamp-2">{doc.error_message}</p>
              )}

              <p className="mt-2 text-xs text-muted-foreground">
                {new Date(doc.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
