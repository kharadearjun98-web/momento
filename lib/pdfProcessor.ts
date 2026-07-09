import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Extract text content from a PDF file
 * @param file - The PDF file to process
 * @returns Extracted text content
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    console.log('📄 Extracting text from PDF:', file.name);
    
    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    console.log(`   Pages: ${pdf.numPages}`);
    
    // Extract text from all pages
    const textPages: string[] = [];
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Combine text items with spaces
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      textPages.push(pageText);
      
      if (pageNum % 10 === 0) {
        console.log(`   Processed ${pageNum}/${pdf.numPages} pages...`);
      }
    }
    
    const fullText = textPages.join('\n\n');
    console.log(`✅ Extracted ${fullText.length} characters from ${pdf.numPages} pages`);
    
    return fullText;
  } catch (error) {
    console.error('❌ Error extracting PDF text:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text and split into chunks for better processing
 * @param file - The PDF file to process
 * @param chunkSize - Maximum characters per chunk (default: 10000)
 * @returns Array of text chunks with metadata
 */
export async function extractAndChunkPDF(
  file: File,
  chunkSize: number = 10000
): Promise<{ chunks: Array<{ content: string; index: number; pageRange: string }> }> {
  const fullText = await extractTextFromPDF(file);
  
  const chunks: Array<{ content: string; index: number; pageRange: string }> = [];
  
  // Simple chunking by character count
  for (let i = 0; i < fullText.length; i += chunkSize) {
    const chunk = fullText.substring(i, i + chunkSize);
    chunks.push({
      content: chunk,
      index: chunks.length,
      pageRange: `chars ${i}-${i + chunk.length}`,
    });
  }
  
  console.log(`📦 Split into ${chunks.length} chunks`);
  
  return { chunks };
}
