"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Collection, Document as DocType } from "@/types";
import {
  FolderOpen,
  Plus,
  Trash2,
  Loader2,
  FileText,
  X,
  Edit2,
  Check,
} from "lucide-react";

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [documents, setDocuments] = useState<DocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [collectionDocs, setCollectionDocs] = useState<DocType[]>([]);
  const [showAddDocs, setShowAddDocs] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [cols, docs] = await Promise.all([api.listCollections(), api.listDocuments()]);
      setCollections(cols);
      setDocuments(docs.documents.filter((d) => d.status === "ready"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadCollectionDocs = async (id: string) => {
    try {
      const docs = await api.getCollectionDocuments(id);
      setCollectionDocs(docs);
      setSelectedCollection(id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load collection documents");
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.createCollection(newName.trim(), newDesc.trim() || undefined);
      toast.success("Collection created!");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create collection");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete collection "${name}"? Documents will NOT be deleted.`)) return;
    try {
      await api.deleteCollection(id);
      if (selectedCollection === id) {
        setSelectedCollection(null);
        setCollectionDocs([]);
      }
      toast.success("Collection deleted");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await api.updateCollection(id, editName.trim());
      setEditingId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
    }
  };

  const handleAddDoc = async (docId: string) => {
    if (!selectedCollection) return;
    try {
      await api.addDocumentsToCollection(selectedCollection, [docId]);
      toast.success("Document added to collection");
      loadCollectionDocs(selectedCollection);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add document");
    }
  };

  const handleRemoveDoc = async (docId: string) => {
    if (!selectedCollection) return;
    try {
      await api.removeDocumentsFromCollection(selectedCollection, [docId]);
      toast.success("Document removed from collection");
      loadCollectionDocs(selectedCollection);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove document");
    }
  };

  const availableDocs = documents.filter(
    (d) => !collectionDocs.find((cd) => cd.id === d.id)
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Collections</h1>
          <p className="text-sm text-muted-foreground mt-1">Organize documents into groups</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Collection
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">New Collection</h3>
              <button onClick={() => setShowCreate(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Collection name"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                autoFocus
              />
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add documents modal */}
      {showAddDocs && selectedCollection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAddDocs(false)}>
          <div className="mx-4 w-full max-w-md max-h-[70vh] overflow-auto rounded-xl border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Add Documents</h3>
              <button onClick={() => setShowAddDocs(false)}><X className="h-4 w-4" /></button>
            </div>
            {availableDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">All documents are already in this collection.</p>
            ) : (
              <div className="space-y-2">
                {availableDocs.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => handleAddDoc(doc.id)}
                    className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted transition-colors"
                  >
                    <FileText className="h-4 w-4 text-red-500 shrink-0" />
                    <span className="text-sm truncate">{doc.original_filename}</span>
                    <Plus className="h-4 w-4 ml-auto text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Collections list */}
          <div>
            {collections.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16">
                <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold">No collections yet</h3>
                <p className="text-sm text-muted-foreground mt-1">Create one to organize your documents</p>
              </div>
            ) : (
              <div className="space-y-2">
                {collections.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => loadCollectionDocs(col.id)}
                    className={`group flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all hover:shadow-md ${
                      selectedCollection === col.id ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <FolderOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {editingId === col.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-7 flex-1 rounded border bg-background px-2 text-sm"
                            autoFocus
                            onKeyDown={(e) => e.key === "Enter" && handleRename(col.id)}
                          />
                          <button onClick={(e) => { e.stopPropagation(); handleRename(col.id); }}>
                            <Check className="h-4 w-4 text-green-500" />
                          </button>
                        </div>
                      ) : (
                        <h3 className="font-medium text-sm truncate">{col.name}</h3>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {col.document_count} document{col.document_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(col.id); setEditName(col.name); }}
                        className="rounded p-1 hover:bg-muted"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(col.id, col.name); }}
                        className="rounded p-1 hover:bg-red-500/10 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Collection documents */}
          <div>
            {selectedCollection ? (
              <div className="rounded-xl border p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">Documents in Collection</h3>
                  <button
                    onClick={() => setShowAddDocs(true)}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                </div>
                {collectionDocs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No documents in this collection</p>
                ) : (
                  <div className="space-y-2">
                    {collectionDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 rounded-lg border p-3">
                        <FileText className="h-4 w-4 text-red-500 shrink-0" />
                        <span className="text-sm truncate flex-1">{doc.original_filename}</span>
                        <button
                          onClick={() => handleRemoveDoc(doc.id)}
                          className="rounded p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-xl border-2 border-dashed py-16">
                <p className="text-sm text-muted-foreground">Select a collection to view its documents</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
