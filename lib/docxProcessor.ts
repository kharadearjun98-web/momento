import mammoth from 'mammoth/mammoth.browser';

/**
 * Extract text content from a Word (.docx) file
 * @param file - The .docx file to process
 * @returns Extracted plain text content
 */
export async function extractTextFromDocx(file: File): Promise<string> {
  try {
    console.log('📝 Extracting text from DOCX:', file.name);

    // Convert file to ArrayBuffer (mammoth's browser build reads from this)
    const arrayBuffer = await file.arrayBuffer();

    const result = await mammoth.extractRawText({ arrayBuffer });
    const fullText = (result.value || '').trim();

    console.log(`✅ Extracted ${fullText.length} characters from ${file.name}`);

    return fullText;
  } catch (error) {
    console.error('❌ Error extracting DOCX text:', error);
    throw new Error(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
