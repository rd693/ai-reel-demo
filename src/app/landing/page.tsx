"use client";

import Link from "next/link";
import { Sparkles, Zap, Globe, Shield, ArrowRight, Play, Star, CheckCircle2 } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="bg-white text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Sparkles className="text-white" size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">FacelessReels AI</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-indigo-600 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-indigo-600 transition-colors">How it Works</a>
            <a href="#pricing" className="hover:text-indigo-600 transition-colors">Pricing</a>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm font-semibold text-slate-600 hover:text-slate-900 px-4 py-2 transition-colors">
              Login
            </Link>
            <Link href="/dashboard/series/new" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-full font-bold text-sm shadow-lg shadow-indigo-200 transition-all hover:scale-105 active:scale-95">
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-24 px-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-50 rounded-full blur-3xl opacity-60 animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-50 rounded-full blur-3xl opacity-60" />
        </div>

        <div className="max-w-5xl mx-auto text-center space-y-8 relative">
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-4 py-1.5 rounded-full text-indigo-600 text-xs font-bold uppercase tracking-wider animate-[fadeIn_0.5s_ease-out]">
            <Zap size={14} />
            The Future of Content Creation
          </div>
          
          <h1 className="text-6xl md:text-7xl font-extrabold text-slate-900 leading-[1.1] tracking-tight animate-[fadeIn_0.7s_ease-out]">
            Viral Faceless Videos <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">on Auto-Pilot.</span>
          </h1>
          
          <p className="text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed animate-[fadeIn_0.9s_ease-out]">
            The only AI that generates, edits, and posts high-quality faceless reels for you automatically, while you focus on scaling your brand.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 animate-[fadeIn_1.1s_ease-out]">
            <Link href="/dashboard/series/new" className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-5 rounded-full font-bold text-lg shadow-2xl shadow-indigo-200 flex items-center justify-center gap-2 transition-all hover:-translate-y-1">
              Start Your First Series
              <ArrowRight size={20} />
            </Link>
            <button className="w-full sm:w-auto bg-white border border-slate-200 hover:border-slate-300 text-slate-700 px-10 py-5 rounded-full font-bold text-lg shadow-sm flex items-center justify-center gap-2 transition-all">
              <Play size={20} className="text-indigo-600" />
              Watch Demo
            </button>
          </div>

          {/* Social Proof */}
          <div className="pt-12 flex flex-col items-center gap-4 animate-[fadeIn_1.3s_ease-out]">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center overflow-hidden">
                  <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="User" />
                </div>
              ))}
            </div>
            <p className="text-sm font-medium text-slate-500">
              Trusted by <span className="text-slate-900 font-bold text-lg">840k+</span> creators worldwide
            </p>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="py-24 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl font-bold text-slate-900 tracking-tight">Why Choose FacelessReels?</h2>
            <p className="text-slate-500 text-lg">Everything you need to dominate social media on auto-pilot.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { title: "Unlimited Niches", desc: "From Mythology to School Gossip, our AI handles any topic with ease.", icon: <Globe className="text-indigo-600" /> },
              { title: "Auto-Posting", desc: "Schedule and post automatically to TikTok, Instagram, and YouTube Shorts.", icon: <Zap className="text-indigo-600" /> },
              { title: "AI Voiceovers", desc: "Access high-quality, human-like voiceovers in multiple languages.", icon: <Play className="text-indigo-600" /> },
              { title: "Custom Art Styles", desc: "Pick cinematic 3D, anime, or vintage styles for your unique brand look.", icon: <Sparkles className="text-indigo-600" /> },
              { title: "Analytics Dashboard", desc: "Track your growth across all platforms in one single place.", icon: <Star className="text-indigo-600" /> },
              { title: "Secure & Safe", desc: "Your accounts are safe with our enterprise-grade security and API hooks.", icon: <Shield className="text-indigo-600" /> }
            ].map((f, i) => (
              <div key={i} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  {f.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{f.title}</h3>
                <p className="text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Showcase Section */}
      <section className="py-24 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center gap-16">
            <div className="flex-1 space-y-8 text-center md:text-left">
              <h2 className="text-5xl font-bold text-slate-900 tracking-tight">
                High-Quality Videos <br />
                <span className="text-indigo-600 underline decoration-indigo-200 underline-offset-8">That Actually Get Views.</span>
              </h2>
              <p className="text-xl text-slate-500 leading-relaxed">
                Stop spending hours on editing. Our AI uses the same patterns as viral creators to ensure your content stands out and engages your audience from the first second.
              </p>
              <ul className="space-y-4">
                {["Cinematic Camera Angles", "Dynamic Caption Animations", "Emotional Soundtracks", "Perfect Pacing & Timing"].map(item => (
                  <li key={item} className="flex items-center gap-3 text-slate-700 font-medium justify-center md:justify-start">
                    <CheckCircle2 className="text-green-500" size={20} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="flex-1 relative">
              <div className="absolute -top-12 -right-12 w-64 h-64 bg-indigo-100 rounded-full blur-3xl opacity-50" />
              <div className="relative aspect-[9/16] w-full max-w-[320px] mx-auto bg-slate-900 rounded-[2.5rem] p-3 shadow-2xl border-4 border-slate-800">
                <div className="w-full h-full rounded-[2rem] bg-indigo-50 overflow-hidden flex items-center justify-center relative">
                   <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/60 z-10" />
                   <div className="absolute bottom-10 left-6 right-6 z-20 space-y-3">
                      <div className="h-4 w-3/4 bg-white/40 rounded-full blur-sm" />
                      <div className="h-4 w-1/2 bg-white/40 rounded-full blur-sm" />
                      <div className="pt-4 flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-white/20 border border-white/30 backdrop-blur-md" />
                         <div className="h-3 w-20 bg-white/30 rounded-full" />
                      </div>
                   </div>
                   <Play className="text-white/40 z-20" size={64} />
                   <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white font-bold text-center z-20 px-8 text-2xl drop-shadow-lg">
                      Viral Mythology Reel <br /> <span className="text-lg font-normal opacity-70">Coming soon...</span>
                   </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-6 text-center space-y-8">
           <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Sparkles className="text-white" size={18} />
            </div>
            <span className="text-lg font-bold tracking-tight">FacelessReels AI</span>
          </div>
          <p className="text-slate-400 max-w-md mx-auto">
            The world's first fully autonomous AI content platform. Built for the next generation of creators.
          </p>
          <div className="flex justify-center gap-8 text-slate-500 text-sm font-medium">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
          <div className="pt-8 text-slate-600 text-xs uppercase tracking-widest font-bold">
            © 2024 FacelessReels AI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
