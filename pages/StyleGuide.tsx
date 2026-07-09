import React from 'react';
import { GlassPanel } from '../components/ui/Glass';
import { Button } from '../components/ui/Button';
import { Home, Bell, Settings, Activity, Download, Share, Video, Mic, Sparkles, PlayCircle, Volume2, FileText, Coins, AlertCircle } from 'lucide-react';
import { useNotification } from '../lib/useNotification';

export const StyleGuide: React.FC = () => {
  const notify = useNotification();

  // Demo notification handlers
  const showProcessingNotification = () => {
    const id = notify.processing('Processing Audio', 'Generating your overview...');
    // Simulate completion after 3 seconds
    setTimeout(() => {
      notify.dismissNotification(id);
      notify.audio('Audio Overview Generated', 'Your audio file is ready to download', {
        label: 'Download Now',
        onClick: () => console.log('Download clicked')
      });
    }, 3000);
  };

  const showSuccessNotification = () => {
    notify.success('Generation Complete', 'Your content has been successfully generated');
  };

  const showErrorNotification = () => {
    notify.error('Generation Failed', 'Unable to process file. Please try again.');
  };

  const showCreditsNotification = () => {
    notify.credits('Credits Updated', '+50 bonus credits added to your account');
  };

  const showDocumentNotification = () => {
    notify.document('Document Ready', 'Your PDF has been generated successfully', {
      label: 'View Document',
      onClick: () => console.log('View clicked')
    });
  };

  const showAllNotifications = () => {
    notify.processing('Processing Audio', 'Generating your overview...');
    setTimeout(() => notify.credits('Credits Updated', '+50 bonus credits added to your account'), 500);
    setTimeout(() => notify.error('Generation Failed', 'Unable to process file. Please try again.'), 1000);
    setTimeout(() => notify.audio('Audio Overview Generated', 'Your audio file is ready to download'), 1500);
    setTimeout(() => notify.document('Document Ready', 'Your PDF has been generated successfully'), 2000);
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-8 space-y-12">
      <div className="border-b border-white/10 pb-6">
        <h1 className="font-display text-4xl font-bold text-white mb-2">Memento Design System</h1>
        <p className="text-slate-400">Liquid Glass + Purple • Dark Mode Only</p>
      </div>

      {/* Colors */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Color Palette</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           <div className="space-y-2">
             <div className="h-20 rounded-xl bg-memento-purple-500 shadow-glow"></div>
             <div className="flex justify-between text-xs"><span className="text-white">Primary Purple</span><span className="text-slate-500">#8B5CF6</span></div>
           </div>
           <div className="space-y-2">
             <div className="h-20 rounded-xl bg-memento-accent-cyan"></div>
             <div className="flex justify-between text-xs"><span className="text-white">Accent Cyan</span><span className="text-slate-500">#22D3EE</span></div>
           </div>
           <div className="space-y-2">
             <div className="h-20 rounded-xl bg-memento-accent-pink"></div>
             <div className="flex justify-between text-xs"><span className="text-white">Accent Pink</span><span className="text-slate-500">#F472B6</span></div>
           </div>
           <div className="space-y-2">
             <div className="h-20 rounded-xl bg-[#0B0E13] border border-white/10"></div>
             <div className="flex justify-between text-xs"><span className="text-white">Background</span><span className="text-slate-500">#0B0E13</span></div>
           </div>
        </div>
      </section>

      {/* Glass Variants */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Glassmorphism Tokens</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <GlassPanel intensity="low" className="p-6 h-32 flex items-center justify-center">
            <span className="text-slate-300">Low Intensity (Lists)</span>
          </GlassPanel>
          <GlassPanel intensity="medium" className="p-6 h-32 flex items-center justify-center">
            <span className="text-slate-200">Medium (Cards)</span>
          </GlassPanel>
          <GlassPanel intensity="high" className="p-6 h-32 flex items-center justify-center border-memento-purple-500/20">
            <span className="text-white font-medium">High (Modals/Active)</span>
          </GlassPanel>
        </div>
      </section>

      {/* Buttons */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Components: Buttons</h2>
        <div className="flex flex-wrap gap-6 items-center p-8 border border-white/5 rounded-2xl bg-white/[0.02]">
          <div className="flex flex-col gap-2 items-center">
             <Button variant="primary" size="lg" icon={<Sparkles size={18} />}>New Notebook</Button>
             <span className="text-xs text-slate-500">Primary (Border Beam)</span>
          </div>
          <div className="flex flex-col gap-2 items-center">
             <Button variant="glow" size="lg" icon={<Sparkles size={18} />}>Discover Sources</Button>
             <span className="text-xs text-slate-500">Glow (Cyan Beam)</span>
          </div>
          <div className="flex flex-col gap-2 items-center">
             <Button variant="secondary" icon={<Share size={16} />}>Secondary</Button>
             <span className="text-xs text-slate-500">Secondary</span>
          </div>
          <Button variant="outline" icon={<Download size={16} />}>Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" size="icon" icon={<Sparkles size={18} />} />
        </div>
      </section>

      {/* Typography */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Typography (Inter Tight + Inter)</h2>
        <div className="space-y-4">
          <h1 className="font-display text-6xl font-bold text-white">Display XL</h1>
          <h2 className="font-display text-4xl font-semibold text-white">Display Large</h2>
          <h3 className="text-2xl font-medium text-slate-200">Heading Medium</h3>
          <p className="text-base text-slate-400 max-w-2xl">
            Body text is set in Inter for maximum legibility on glass backgrounds. The contrast ratio is carefully managed to ensure accessibility standards (WCAG AA) are met even with the transparency effects.
          </p>
          <code className="font-mono text-sm text-memento-accent-cyan bg-memento-accent-cyan/10 px-2 py-1 rounded">
            const fontStack = "JetBrains Mono";
          </code>
        </div>
      </section>

      {/* Push Notifications */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Push Notifications</h2>
        <p className="text-slate-400 text-sm mb-4">
          Animated toast-style notifications for system events, generation status, and user feedback.
        </p>
        <div className="flex flex-wrap gap-4 p-8 border border-white/5 rounded-2xl bg-white/[0.02]">
          <div className="flex flex-col gap-2 items-center">
            <Button variant="secondary" icon={<Mic size={16} />} onClick={showProcessingNotification}>
              Processing → Success
            </Button>
            <span className="text-xs text-slate-500">With transition</span>
          </div>
          <div className="flex flex-col gap-2 items-center">
            <Button variant="secondary" icon={<Sparkles size={16} />} onClick={showSuccessNotification}>
              Success
            </Button>
            <span className="text-xs text-slate-500">Generic success</span>
          </div>
          <div className="flex flex-col gap-2 items-center">
            <Button variant="secondary" icon={<AlertCircle size={16} />} onClick={showErrorNotification}>
              Error
            </Button>
            <span className="text-xs text-slate-500">Error state</span>
          </div>
          <div className="flex flex-col gap-2 items-center">
            <Button variant="secondary" icon={<Coins size={16} />} onClick={showCreditsNotification}>
              Credits
            </Button>
            <span className="text-xs text-slate-500">Credits update</span>
          </div>
          <div className="flex flex-col gap-2 items-center">
            <Button variant="secondary" icon={<FileText size={16} />} onClick={showDocumentNotification}>
              Document
            </Button>
            <span className="text-xs text-slate-500">PDF ready</span>
          </div>
          <div className="flex flex-col gap-2 items-center">
            <Button variant="primary" icon={<Bell size={16} />} onClick={showAllNotifications}>
              Show All
            </Button>
            <span className="text-xs text-slate-500">Demo stack</span>
          </div>
        </div>
      </section>
    </div>
  );
};