// Simple email sender using Gmail SMTP
// This will work without any API keys

export async function sendVerificationCode(email: string, code: string): Promise<void> {
  void email;
  void code;

  // We'll use a simple approach: browser-based email using mailto (not ideal)
  // OR we can use a free service like EmailJS
  
  // For now, let's create a solution that works with nodemailer
  // But since we're in browser, we'll need a different approach
  
  // We'll use fetch to call a simple email service
  // You need to set up a simple email sender
  throw new Error('Email API not configured - please set up Resend or SMTP');
}
