import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ReelInputForm } from "../../../components/reel-editor/ReelInputForm";

export default function NewReelPage() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <Link 
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900 mb-8 transition-colors"
      >
        <ChevronLeft size={16} />
        Back to Dashboard
      </Link>
      
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Create New Reel</h1>
        <p className="text-slate-500 mt-2">Enter the business details to generate a structured video blueprint.</p>
      </div>

      <ReelInputForm />
    </div>
  );
}
