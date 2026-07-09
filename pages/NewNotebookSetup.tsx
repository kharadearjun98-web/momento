
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, Search, ArrowRight, FileText, Youtube, Globe, Mic, Sparkles, X, Trash2, File, CheckCircle2, Loader2 } from 'lucide-react';
import { GlassPanel, Glow } from '../components/ui/Glass';
import { Button } from '../components/ui/Button';
import { supabase } from '../lib/supabase/client';
import { extractTextFromPDF } from '../lib/pdfProcessor';
import { extractTextFromDocx } from '../lib/docxProcessor';
import { chunkText, generateEmbeddings } from '../lib/documentProcessor';
import { useNotification } from '../lib/useNotification';

export const NewNotebookSetup: React.FC = () => {
  const navigate = useNavigate();
  const notification = useNotification();

  // State
  const [view, setView] = useState<'selection' | 'upload'>('selection');
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [notebookId, setNotebookId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    setView('upload');
  };

  const handleDiscover = () => {
    navigate('/discover');
  };

  // Drag & Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const finalizeUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);

    try {
      // Get current user
      setUploadProgress('Checking authentication...');
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('You must be signed in to upload files');
      }

      console.log('User authenticated:', user.email);

      // Extract text from first PDF to generate title
      let notebookTitle = 'New Notebook';
      if (files.length > 0 && files[0].type === 'application/pdf') {
        try {
          const firstPdfContent = await extractTextFromPDF(files[0]);

          // Generate title using AI based on content
          const titlePrompt = `Based on this document content, generate a concise, descriptive title (3-6 words maximum) that captures the main topic:\n\n${firstPdfContent.substring(0, 1500)}\n\nRespond with ONLY the title, nothing else.`;

          const { data: titleData, error: titleError } = await supabase.functions.invoke('chat', {
            body: {
              task: 'notebook-title',
              model: 'nvidia/nemotron-3-nano-30b-a3b:free',
              messages: [{ role: 'user', content: titlePrompt }],
              maxTokens: 20,
              temperature: 0.7,
            },
          });

          if (titleError) {
            throw new Error(titleError.message);
          }

          const generatedTitle =
            titleData?.content ||
            titleData?.message ||
            titleData?.choices?.[0]?.message?.content;

          notebookTitle = generatedTitle?.trim() || files[0].name.replace('.pdf', '');
          console.log('Generated title:', notebookTitle);
        } catch (error) {
          console.error('Error generating title:', error);
          // Fallback to first PDF name
          notebookTitle = files[0].name.replace(/\.[^/.]+$/, '');
        }
      }

      // Create a new notebook
      setUploadProgress('Creating notebook...');
      const { data: notebook, error: notebookError } = await supabase
        .from('notebooks')
        .insert({
          user_id: user.id,
          title: notebookTitle,
          description: 'Uploaded documents',
        })
        .select()
        .single();

      if (notebookError) {
        console.error('Notebook creation error:', notebookError);
        throw new Error(`Failed to create notebook: ${notebookError.message}`);
      }

      console.log('Notebook created:', notebook.id);
      setNotebookId(notebook.id);

      // Process each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Processing ${file.name} (${i + 1}/${files.length})...`);
        console.log(`Processing file ${i + 1}:`, file.name, file.type);

        // Upload file to Supabase Storage
        const filePath = `${notebook.id}/${Date.now()}-${file.name}`;
        console.log('Uploading to storage:', filePath);

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          throw new Error(`Storage upload failed: ${uploadError.message}`);
        }

        console.log('File uploaded to storage');

        // Get public URL (for reference, but we'll use file_path in DB)
        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);

        // Extract text from PDF
        let content = '';
        let processingStatus = 'pending';

        if (file.type === 'application/pdf') {
          try {
            setUploadProgress(`Extracting text from ${file.name}...`);
            content = await extractTextFromPDF(file);
            processingStatus = 'completed';
            console.log(`✅ Extracted ${content.length} characters from ${file.name}`);
          } catch (error) {
            console.error('PDF extraction error:', error);
            processingStatus = 'failed';
          }
        } else if (
          file.type === 'text/plain' ||
          file.name.toLowerCase().endsWith('.txt') ||
          file.name.toLowerCase().endsWith('.md')
        ) {
          try {
            setUploadProgress(`Reading ${file.name}...`);
            content = await file.text();
            processingStatus = 'completed';
            console.log(`✅ Read ${content.length} characters from ${file.name}`);
          } catch (error) {
            console.error('Text read error:', error);
            processingStatus = 'failed';
          }
        } else if (
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          file.name.toLowerCase().endsWith('.docx')
        ) {
          try {
            setUploadProgress(`Extracting text from ${file.name}...`);
            content = await extractTextFromDocx(file);
            processingStatus = 'completed';
            console.log(`✅ Extracted ${content.length} characters from ${file.name}`);
          } catch (error) {
            console.error('DOCX extraction error:', error);
            processingStatus = 'failed';
          }
        }

        // Sanitize content to remove problematic Unicode characters
        const sanitizeText = (text: string): string => {
          if (!text) return text;
          // Remove null bytes, control characters, and invalid Unicode escape sequences
          return text
            .replace(/\u0000/g, '') // Remove null bytes
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars except tab, newline, carriage return
            .replace(/\\u[0-9a-fA-F]{0,3}(?![0-9a-fA-F])/g, '') // Remove invalid Unicode escapes
            .replace(/[\uFFFE\uFFFF]/g, ''); // Remove non-characters
        };

        const sanitizedContent = content ? sanitizeText(content) : null;

        // Create source record with content
        const { data: source, error: sourceError } = await supabase
          .from('sources')
          .insert({
            notebook_id: notebook.id,
            title: file.name,
            type: getFileType(file),
            file_path: filePath,
            content: sanitizedContent,
            processing_status: processingStatus,
          })
          .select()
          .single();

        if (sourceError) {
          console.error('Source creation error:', sourceError);
          throw new Error(`Failed to create source record: ${sourceError.message}`);
        }

        console.log('Source created:', source.id);

        // Create embeddings and store chunks for RAG
        if (content && source) {
          try {
            setUploadProgress(`Creating embeddings for ${file.name}...`);

            // Chunk the text
            const chunks = chunkText(content, 1000, 200);
            console.log(`📦 Created ${chunks.length} chunks`);

            // Generate embeddings in batches
            const batchSize = 20;
            for (let j = 0; j < chunks.length; j += batchSize) {
              const batch = chunks.slice(j, Math.min(j + batchSize, chunks.length));
              const embeddings = await generateEmbeddings(batch);

              // Insert chunks with embeddings
              const chunksToInsert = batch.map((chunkContent, idx) => ({
                source_id: source.id,
                content: sanitizeText(chunkContent),
                embedding: embeddings[idx],
                chunk_index: j + idx,
                metadata: {
                  file_name: file.name,
                  chunk_index: j + idx,
                },
              }));

              const { error: chunkError } = await supabase
                .from('document_chunks')
                .insert(chunksToInsert);

              if (chunkError) {
                console.error('Error inserting chunks:', chunkError);
              }

              console.log(`✅ Inserted chunks ${j + 1}-${Math.min(j + batchSize, chunks.length)} of ${chunks.length}`);
            }

            console.log(`🎯 All embeddings created for ${file.name}`);

            // Extract knowledge graph (LightRAG)
            setUploadProgress(`Extracting knowledge graph from ${file.name}...`);
            try {
              const { extractAndStoreGraph } = await import('../lib/lightrag');
              await extractAndStoreGraph(
                source.id,
                notebook.id,
                chunks,
                (progress) => setUploadProgress(progress)
              );
            } catch (graphError) {
              console.error('Graph extraction error:', graphError);
              // Continue even if graph extraction fails
            }
          } catch (embeddingError) {
            console.error('Embedding error:', embeddingError);
          }
        }
      }

      setUploadProgress('Complete!');
      console.log('All files processed successfully');

      // Navigate to the new notebook
      setTimeout(() => {
        navigate(`/notebook/${notebook.id}`);
      }, 500);
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      notification.error('Upload Failed', errorMessage);
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  const getFileType = (file: File): string => {
    if (file.type === 'application/pdf') return 'pdf';
    if (file.type.startsWith('audio/')) return 'audio';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type === 'text/plain') return 'text';
    return 'text';
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const SourceTypes = () => (
    <div className="flex gap-4 mt-10 opacity-50 group-hover:opacity-100 transition-opacity duration-500">
      <div className="flex flex-col items-center gap-2">
        <div className="p-2 rounded-full bg-white/5"><FileText size={16} /></div>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">PDF</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="p-2 rounded-full bg-white/5"><Mic size={16} /></div>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Audio</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="p-2 rounded-full bg-white/5"><Globe size={16} /></div>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Web</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="p-2 rounded-full bg-white/5"><Youtube size={16} /></div>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Video</span>
      </div>
    </div>
  );

  return (
    <div className="h-full w-full relative overflow-y-auto custom-scrollbar">
      {/* Background Ambiance */}
      <div className="fixed inset-0 pointer-events-none">
        <Glow className="top-1/4 left-1/4 w-[600px] h-[600px] bg-memento-purple-600/20" />
        <Glow className="bottom-1/4 right-1/4 w-[500px] h-[500px] bg-memento-accent-cyan/10" />
      </div>

      <div className="min-h-full flex flex-col items-center justify-center p-8 py-12 relative z-10">

        {/* View: Selection (The Fork) */}
        {view === 'selection' && (
          <>
            <div className="text-center mb-16 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700 shrink-0">
              <h1 className="font-display text-5xl font-bold text-white tracking-tight">
                Initialize Memento
              </h1>
              <p className="text-lg text-slate-400 max-w-xl mx-auto">
                How would you like to begin your deep dive?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-10 w-full max-w-7xl shrink-0">
              {/* Option 1: Upload */}
              <div onClick={handleUploadClick} className="group cursor-pointer animate-in slide-in-from-bottom-8 duration-700 delay-100">
                <GlassPanel
                  variant="card"
                  intensity="medium"
                  className="h-[600px] relative overflow-hidden transition-all duration-500 group-hover:-translate-y-2 group-hover:border-memento-purple-500/30"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-memento-purple-500/0 to-memento-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <div className="h-full flex flex-col items-center justify-center p-10 pb-16 text-center relative z-10">
                    <div className="w-24 h-24 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:bg-memento-purple-500/20 group-hover:border-memento-purple-500/50 transition-all duration-500 shadow-glass">
                      <UploadCloud size={48} className="text-slate-300 group-hover:text-memento-purple-400 transition-colors" strokeWidth={1.5} />
                    </div>

                    <h2 className="text-3xl font-display font-semibold text-white mb-3">Upload Sources</h2>
                    <p className="text-slate-400 leading-relaxed max-w-xs mx-auto">
                      Drag & drop your existing knowledge base.
                    </p>

                    <SourceTypes />

                    <div className="absolute bottom-10 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500">
                      <Button variant="primary">Select Files</Button>
                    </div>
                  </div>
                </GlassPanel>
              </div>

              {/* Option 2: Discover */}
              <div onClick={handleDiscover} className="group cursor-pointer animate-in slide-in-from-bottom-8 duration-700 delay-200">
                <GlassPanel
                  variant="card"
                  intensity="medium"
                  className="h-[600px] relative overflow-hidden transition-all duration-500 group-hover:-translate-y-2 group-hover:border-memento-accent-cyan/30"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-memento-accent-cyan/0 to-memento-accent-cyan/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <div className="h-full flex flex-col items-center justify-center p-10 pb-16 text-center relative z-10">
                    <div className="w-24 h-24 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:bg-memento-accent-cyan/20 group-hover:border-memento-accent-cyan/50 transition-all duration-500 shadow-glass">
                      <Search size={48} className="text-slate-300 group-hover:text-memento-accent-cyan transition-colors" strokeWidth={1.5} />
                    </div>

                    <h2 className="text-3xl font-display font-semibold text-white mb-3">Discover Sources</h2>
                    <p className="text-slate-400 leading-relaxed max-w-xs mx-auto">
                      Let AI find and vet high-quality materials for you.
                    </p>

                    <SourceTypes />

                    <div className="absolute bottom-10 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500">
                      <Button variant="glow">Start Search</Button>
                    </div>
                  </div>
                </GlassPanel>
              </div>
            </div>

            <div className="mt-16 animate-in fade-in duration-1000 delay-500 shrink-0">
              <Button
                variant="secondary"
                className="h-14 px-8 rounded-full bg-white/[0.02] hover:bg-white/[0.08] border-white/5 hover:border-white/10 text-slate-400 hover:text-slate-200 transition-all group"
                onClick={() => navigate('/notebook/empty')}
              >
                <div className="flex items-center gap-3">
                  <span className="text-base font-medium">Skip and create empty notebook</span>
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                    <ArrowRight size={16} className="opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </Button>
            </div>
          </>
        )}

        {/* View: Upload Interface */}
        {view === 'upload' && (
          <div className="w-full max-w-3xl animate-in zoom-in-95 duration-500 fade-in">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-display font-bold text-white">Upload Sources</h2>
                <p className="text-slate-400 mt-1">Add documents to create your knowledge base.</p>
              </div>
              <Button variant="secondary" size="icon" onClick={() => setView('selection')}>
                <X size={20} />
              </Button>
            </div>

            {/* Drag & Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative h-64 rounded-2xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center cursor-pointer group
                ${isDragging
                  ? 'border-memento-purple-500 bg-memento-purple-500/10 scale-[1.01]'
                  : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
                }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                multiple
                className="hidden"
                onChange={handleFileInput}
              />

              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300
                ${isDragging ? 'bg-memento-purple-500 text-white' : 'bg-white/5 text-slate-400 group-hover:scale-110'}`}>
                <UploadCloud size={32} strokeWidth={1.5} />
              </div>
              <p className="text-lg font-medium text-slate-200">
                {isDragging ? 'Drop files here' : 'Click or drag files to upload'}
              </p>
              <p className="text-sm text-slate-500 mt-2">
                PDF, MP3, MP4, or DOCX (Max 500MB)
              </p>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="mt-8 space-y-4 animate-in slide-in-from-bottom-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Queue ({files.length})</h3>
                  <button onClick={() => setFiles([])} className="text-xs text-red-400 hover:text-red-300">Clear All</button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                  {files.map((file, idx) => (
                    <GlassPanel key={`${file.name}-${idx}`} variant="card" className="p-3 flex items-center gap-4 group border-white/5 hover:border-white/10">
                      <div className="w-10 h-10 rounded-lg bg-memento-purple-500/10 flex items-center justify-center text-memento-purple-400">
                        <File size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-slate-200 truncate">{file.name}</h4>
                        <p className="text-xs text-slate-500">{formatSize(file.size)}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </GlassPanel>
                  ))}
                </div>
              </div>
            )}

            {/* Action Footer */}
            <div className="mt-8 flex items-center justify-end gap-4 border-t border-white/10 pt-6">
              <Button variant="ghost" onClick={() => setView('selection')}>Cancel</Button>
              <Button
                variant="primary"
                size="lg"
                onClick={finalizeUpload}
                disabled={files.length === 0 || isUploading}
                icon={isUploading ? undefined : <CheckCircle2 size={18} />}
              >
                {isUploading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="animate-spin" size={18} />
                    <span>{uploadProgress || 'Processing...'}</span>
                  </div>
                ) : (
                  `Upload ${files.length > 0 ? `${files.length} Files` : ''}`
                )}
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
