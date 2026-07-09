import React, { useState, useRef } from 'react';
import { X, UploadCloud, File, Trash2, CheckCircle2 } from 'lucide-react';
import { GlassPanel, Glow } from './ui/Glass';
import { Button } from './ui/Button';
import { supabase } from '../lib/supabase/client';
import { extractTextFromPDF } from '../lib/pdfProcessor';
import { extractTextFromDocx } from '../lib/docxProcessor';
import { chunkText, generateEmbeddings } from '../lib/documentProcessor';
import { useNotification } from '../lib/useNotification';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  notebookId: string;
}

const SUPPORTED_FILE_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const SUPPORTED_FILE_EXTENSIONS = ['.pdf', '.txt', '.md', '.docx'];
const SUPPORTED_FILE_LABEL = 'PDF, TXT, MD, or DOCX';

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, notebookId }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notification = useNotification();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const isSupportedFile = (file: File) => {
    const name = file.name.toLowerCase();
    return SUPPORTED_FILE_TYPES.has(file.type) || SUPPORTED_FILE_EXTENSIONS.some(ext => name.endsWith(ext));
  };

  const addFiles = (incomingFiles: File[]) => {
    const supportedFiles = incomingFiles.filter(isSupportedFile);
    const unsupportedFiles = incomingFiles.filter(file => !isSupportedFile(file));

    if (unsupportedFiles.length > 0) {
      const fileList = unsupportedFiles
        .slice(0, 3)
        .map(file => file.name)
        .join(', ');
      const extraCount = unsupportedFiles.length > 3 ? ` and ${unsupportedFiles.length - 3} more` : '';

      notification.warning(
        'Unsupported File Type',
        `Memento currently supports ${SUPPORTED_FILE_LABEL} uploads only. Skipped: ${fileList}${extraCount}.`
      );
    }

    if (supportedFiles.length > 0) {
      setFiles(prev => [...prev, ...supportedFiles]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0 || !notebookId) return;
    
    setIsUploading(true);
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Uploading ${i + 1}/${files.length}: ${file.name}...`);
        
        // 1. Upload file to Supabase Storage
        const filePath = `${notebookId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);
        
        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw uploadError;
        }
        
        // 2. Get public URL
        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);
        
        // 3. Extract text from PDF (if it's a PDF)
        let content = '';
        let processingStatus = 'pending';
        
        if (file.type === 'application/pdf') {
          try {
            setUploadProgress(`Processing ${i + 1}/${files.length}: Extracting text from ${file.name}...`);
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
            setUploadProgress(`Processing ${i + 1}/${files.length}: Reading ${file.name}...`);
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
            setUploadProgress(`Processing ${i + 1}/${files.length}: Extracting text from ${file.name}...`);
            content = await extractTextFromDocx(file);
            processingStatus = 'completed';
            console.log(`✅ Extracted ${content.length} characters from ${file.name}`);
          } catch (error) {
            console.error('DOCX extraction error:', error);
            processingStatus = 'failed';
          }
        }

        // 4. Save metadata to database
        const { data: sourceData, error: dbError } = await supabase
          .from('sources')
          .insert({
            notebook_id: notebookId,
            title: file.name,
            type: file.type.includes('pdf') ? 'pdf' : 'other',
            file_path: filePath,
            content: content || null,
            processing_status: processingStatus,
          })
          .select()
          .single();
        
        if (dbError) {
          console.error('Database error:', dbError);
          throw dbError;
        }
        
        // 5. Create embeddings and store chunks for RAG
        if (content && sourceData) {
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
                source_id: sourceData.id,
                content: chunkContent,
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
                sourceData.id,
                notebookId,
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
      setTimeout(() => {
        setFiles([]);
        setUploadProgress('');
        setIsUploading(false);
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Upload failed:', error);
      notification.error('Upload Failed', error instanceof Error ? error.message : 'Unknown error');
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-[#050608]/80 backdrop-blur-md" onClick={onClose} />
      
      <GlassPanel variant="panel" intensity="high" className="w-full max-w-2xl relative flex flex-col shadow-2xl border-white/10 animate-in zoom-in-95 duration-300 overflow-hidden">
        <Glow className="top-0 right-0 w-[300px] h-[300px] bg-memento-purple-600/20" />
        
        <div className="p-6 border-b border-white/10 flex items-center justify-between relative z-10">
          <h2 className="text-xl font-display font-semibold text-white">Upload Sources</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar relative z-10">
            {/* Drag Drop Zone */}
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative h-48 rounded-2xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center cursor-pointer group
                ${isDragging 
                  ? 'border-memento-purple-500 bg-memento-purple-500/10 scale-[1.01]' 
                  : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
                }`}
            >
              <input type="file" ref={fileInputRef} multiple accept=".pdf,.txt,.md,.docx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={handleFileInput} />
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-all duration-300 ${isDragging ? 'bg-memento-purple-500 text-white' : 'bg-white/5 text-slate-400 group-hover:scale-110'}`}>
                <UploadCloud size={24} strokeWidth={1.5} />
              </div>
              <p className="text-base font-medium text-slate-200">{isDragging ? 'Drop files here' : 'Click or drag to upload'}</p>
              <p className="text-xs text-slate-500 mt-1">PDF only (Max 500MB)</p>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="mt-6 space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">Queue ({files.length})</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                  {files.map((file, idx) => (
                    <GlassPanel key={idx} variant="card" className="p-3 flex items-center gap-3 group border-white/5 hover:border-white/10">
                      <div className="w-8 h-8 rounded bg-memento-purple-500/10 flex items-center justify-center text-memento-purple-400">
                        <File size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-slate-200 truncate">{file.name}</h4>
                        <p className="text-[10px] text-slate-500">{formatSize(file.size)}</p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); removeFile(idx); }} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-white/5 rounded transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 size={14} />
                      </button>
                    </GlassPanel>
                  ))}
                </div>
              </div>
            )}
        </div>

        <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0B0E13]/50 relative z-10">
          {isUploading && uploadProgress && (
            <div className="flex-1 text-xs text-slate-400 flex items-center">
              {uploadProgress}
            </div>
          )}
          <Button variant="ghost" onClick={onClose} disabled={isUploading}>Cancel</Button>
          <Button 
            variant="primary" 
            onClick={handleUpload} 
            disabled={files.length === 0 || isUploading}
            isLoading={isUploading}
            icon={!isUploading ? <CheckCircle2 size={16} /> : undefined}
          >
            {isUploading ? 'Uploading...' : 'Upload Files'}
          </Button>
        </div>
      </GlassPanel>
    </div>
  );
};
