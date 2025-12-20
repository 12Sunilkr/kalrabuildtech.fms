import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { GoogleGenerativeAI } from "@google/generative-ai";

interface AITextEnhancerProps {
  text: string;
  onUpdate: (newText: string) => void;
  context?: string;
  mini?: boolean;
}

export const AITextEnhancer: React.FC<AITextEnhancerProps> = ({ 
  text, 
  onUpdate, 
  context = 'professional', 
  mini = false 
}) => {
  const [loading, setLoading] = useState(false);

  const handleEnhance = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!text || !text.trim()) return;

    setLoading(true);
    try {
      const ai = new GoogleGenerativeAI(
        import.meta.env.VITE_GEMINI_API_KEY as string
      );

      const model = ai.getGenerativeModel({
        model: "gemini-1.5-flash",
      });

      const prompt = `Fix grammar, spelling, and improve clarity for the following text. Make it ${context}. Return ONLY the corrected text, no explanations or quotes:\n\n"${text}"`;

      const response = await model.generateContent(prompt);

      const correctedText = response.response.text().trim();

      if (correctedText) {
        onUpdate(correctedText);
      }

    } catch (error) {
      console.error("AI Enhancement failed", error);
      alert("Could not enhance text at this time.");
    } finally {
      setLoading(false);
    }
  };

  if (mini) {
    return (
      <button
        onClick={handleEnhance}
        disabled={loading || !text}
        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${
          loading ? 'text-slate-400' : 'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'
        }`}
        title="AI Fix Grammar"
        type="button"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
      </button>
    );
  }

  return (
    <button
      onClick={handleEnhance}
      disabled={loading || !text}
      className={`flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-md transition-all mt-1 ${
        loading 
          ? 'bg-slate-100 text-slate-400 cursor-wait' 
          : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
      }`}
      title="Fix grammar and improve clarity"
      type="button"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
      {loading ? 'Fixing...' : 'AI Fix Grammar'}
    </button>
  );
};
